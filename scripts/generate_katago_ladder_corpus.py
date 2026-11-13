#!/usr/bin/env python3
"""Generate deterministic, legal local ladder positions and label them with KataGo."""
from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JSON = ROOT / "tests/katago-ladder/generated-cases.json"
DEFAULT_TS = ROOT / "packages/go-engine/src/katago-ladder-generated.cases.ts"
BOARD_SIZE = 9
TARGETS_BY_REGION = {
    "corner-band": [(1, 1), (1, 7), (7, 1), (7, 7)],
    "edge-band": [(1, 4), (4, 1), (4, 7), (7, 4)],
    "interior": [(4, 4)],
}
REGION_ORDER = tuple(TARGETS_BY_REGION)


def neighbors(row: int, col: int, size: int):
    for point in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
        r, c = point
        if 0 <= r < size and 0 <= c < size:
            yield point


def group_and_liberties(board: list[list[str | None]], start: tuple[int, int]):
    color = board[start[0]][start[1]]
    if color is None:
        return set(), set()
    stones = {start}
    liberties: set[tuple[int, int]] = set()
    stack = [start]
    while stack:
        row, col = stack.pop()
        for nr, nc in neighbors(row, col, len(board)):
            if board[nr][nc] is None:
                liberties.add((nr, nc))
            elif board[nr][nc] == color and (nr, nc) not in stones:
                stones.add((nr, nc))
                stack.append((nr, nc))
    return stones, liberties


def classify_tactical_features(
    board: list[list[str | None]],
    target: tuple[int, int],
    attacker: str,
) -> list[str]:
    """Describe observable local motifs; these are coverage labels, not outcome rules."""
    size = len(board)
    target_stones, liberties = group_and_liberties(board, target)
    features: list[str] = []
    if len(liberties) == 1:
        features.append("target-in-atari")
    elif len(liberties) == 2:
        features.append("target-two-liberties")
    elif len(liberties) == 3:
        features.append("target-three-liberties")
    if len(target_stones) > 1:
        features.append("multi-stone-target")
    row, col = target
    if row in (0, size - 1) or col in (0, size - 1):
        features.append("edge-target")
    if row in (0, size - 1) and col in (0, size - 1):
        features.append("corner-target")

    seen_attacker: set[tuple[int, int]] = set()
    for stone in target_stones:
        for point in neighbors(*stone, size):
            if board[point[0]][point[1]] != attacker or point in seen_attacker:
                continue
            group, group_liberties = group_and_liberties(board, point)
            seen_attacker.update(group)
            if len(group_liberties) == 1:
                features.append("adjacent-attacker-in-atari")
                return features
    return features


def has_only_live_groups(board: list[list[str | None]]) -> bool:
    seen: set[tuple[int, int]] = set()
    for row in range(len(board)):
        for col in range(len(board)):
            if board[row][col] is None or (row, col) in seen:
                continue
            stones, liberties = group_and_liberties(board, (row, col))
            seen.update(stones)
            if not liberties:
                return False
    return True


def generate_candidates(count: int, seed: int = 20261113) -> list[dict[str, Any]]:
    """Create reproducible 9x9 positions with a live target group in 1-3 liberties."""
    rng = random.Random(seed)
    accepted: list[dict[str, Any]] = []
    signatures: set[str] = set()
    attempts = 0
    while len(accepted) < count and attempts < count * 500:
        attempts += 1
        # Cycle accepted cases through three geometric strata. Rejected
        # candidates do not advance the stratum, so the final corpus remains
        # balanced rather than merely hoping random placement covers the edge.
        region = REGION_ORDER[len(accepted) % len(REGION_ORDER)]
        region_targets = TARGETS_BY_REGION[region]
        target = region_targets[(attempts - 1) % len(region_targets)]
        target_color = "white" if (len(accepted) + attempts) % 2 == 0 else "black"
        attacker = "black" if target_color == "white" else "white"
        board: list[list[str | None]] = [[None] * BOARD_SIZE for _ in range(BOARD_SIZE)]
        board[target[0]][target[1]] = target_color

        density = rng.uniform(0.27, 0.49)
        for row in range(max(0, target[0] - 3), min(BOARD_SIZE, target[0] + 4)):
            for col in range(max(0, target[1] - 3), min(BOARD_SIZE, target[1] + 4)):
                if (row, col) == target or rng.random() >= density:
                    continue
                board[row][col] = "black" if rng.random() < 0.5 else "white"

        target_stones, target_liberties = group_and_liberties(board, target)
        if not 1 <= len(target_liberties) <= 3 or len(target_stones) > 5:
            continue
        if not has_only_live_groups(board):
            continue

        signature = json.dumps(board, separators=(",", ":")) + str(target) + attacker
        if signature in signatures:
            continue
        signatures.add(signature)
        stones = [
            [board[row][col], row, col]
            for row in range(BOARD_SIZE)
            for col in range(BOARD_SIZE)
            if board[row][col] is not None
        ]
        accepted.append({
            "id": f"seed-{seed}-case-{len(accepted) + 1:03d}",
            "provenance": "Deterministically generated legal local position; labeled by pinned KataGo C++ oracle",
            "size": BOARD_SIZE,
            "stones": stones,
            "target": list(target),
            "attacker": attacker,
            "firstPlayer": "attacker" if len(accepted) % 2 == 0 else "defender",
            "expected": "unknown",
            "generatorSeed": seed,
            "targetRegion": region,
            "targetLibertiesAtRoot": len(target_liberties),
            "targetStonesAtRoot": len(target_stones),
            "tacticalFeatures": classify_tactical_features(board, target, attacker),
        })
    if len(accepted) != count:
        raise RuntimeError(f"generated only {len(accepted)}/{count} positions after {attempts} attempts")
    return accepted


def label_cases(cases: list[dict[str, Any]], oracle: list[str], timeout: float) -> list[dict[str, Any]]:
    labeled = []
    for case in cases:
        completed = subprocess.run(
            oracle, input=json.dumps(case) + "\n", text=True,
            capture_output=True, timeout=timeout, check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(f"oracle failed for {case['id']}: {completed.stderr.strip()}")
        response = json.loads(completed.stdout)
        if response.get("id") != case["id"] or response.get("status") not in ("captured", "escaped"):
            raise RuntimeError(f"invalid oracle response for {case['id']}: {response!r}")
        labeled_case = dict(case)
        labeled_case["expected"] = response["status"]
        labeled.append(labeled_case)
    return labeled


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--oracle", nargs="+", required=True)
    parser.add_argument("--count", type=int, default=48)
    parser.add_argument("--seed", type=int, default=20261113)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--json-output", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--ts-output", type=Path, default=DEFAULT_TS)
    args = parser.parse_args()
    if args.count < 1 or args.count > 500:
        parser.error("--count must be between 1 and 500")
    try:
        labeled = label_cases(generate_candidates(args.count, args.seed), args.oracle, args.timeout)
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(labeled, indent=2) + "\n", encoding="utf-8")
        args.ts_output.parent.mkdir(parents=True, exist_ok=True)
        args.ts_output.write_text(
            "// Generated by scripts/generate_katago_ladder_corpus.py; do not edit by hand.\n"
            'export interface GeneratedLadderCase { id: string; size: number; stones: [string, number, number][]; target: [number, number]; attacker: "black" | "white"; firstPlayer: "attacker" | "defender"; expected: "captured" | "escaped"; targetRegion: "corner-band" | "edge-band" | "interior"; targetLibertiesAtRoot: number; targetStonesAtRoot: number; }\n'
            "export const generatedLadderCases: GeneratedLadderCase[] = " + json.dumps(labeled, indent=2) + ";\n",
            encoding="utf-8",
        )
        print(f"Wrote {len(labeled)} oracle-labeled cases (seed={args.seed})")
        return 0
    except (OSError, json.JSONDecodeError, subprocess.TimeoutExpired, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
