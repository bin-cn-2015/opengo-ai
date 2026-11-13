#!/usr/bin/env python3
"""Compare the TS ladder golden corpus with an external KataGo C++ oracle adapter.

The adapter is a separate executable that accepts one JSON object on stdin and
prints one JSON object on stdout. See tests/katago-ladder/ORACLE_PROTOCOL.md.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIXTURES = ROOT / "tests/katago-ladder/reference-cases.json"
VALID_STATUSES = {"captured", "escaped", "unknown"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixtures", type=Path, default=DEFAULT_FIXTURES)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--oracle", nargs="+", required=True,
                        help="Oracle adapter executable and arguments")
    args = parser.parse_args()

    try:
        cases = json.loads(args.fixtures.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Cannot read fixture corpus: {exc}", file=sys.stderr)
        return 2
    if not isinstance(cases, list) or not cases:
        print("Fixture corpus must be a non-empty JSON array", file=sys.stderr)
        return 2

    failures = 0
    for case in cases:
        case_id = case.get("id", "<missing-id>")
        try:
            completed = subprocess.run(
                args.oracle,
                input=json.dumps(case) + "\n",
                text=True,
                capture_output=True,
                timeout=args.timeout,
                check=False,
            )
            if completed.returncode != 0:
                raise RuntimeError(
                    f"adapter exited {completed.returncode}: {completed.stderr.strip()}"
                )
            response = json.loads(completed.stdout)
            actual = response.get("status")
            expected = case["expected"]
            if actual not in VALID_STATUSES:
                raise RuntimeError(f"invalid adapter status: {actual!r}")
            if response.get("id") != case_id:
                raise RuntimeError(f"response id {response.get('id')!r} does not match")
            if actual != expected:
                raise RuntimeError(f"status mismatch: expected {expected}, got {actual}; response={response!r}")
            print(f"PASS {case_id}: {actual}")
        except (KeyError, json.JSONDecodeError, subprocess.TimeoutExpired,
                OSError, RuntimeError) as exc:
            failures += 1
            print(f"FAIL {case_id}: {exc}", file=sys.stderr)

    print(f"{len(cases) - failures}/{len(cases)} oracle cases matched")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
