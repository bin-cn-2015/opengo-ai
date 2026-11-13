# Go Engine: Tactical Reading and Pass-Alive Area

This package contains the browser-safe TypeScript board rules and conservative tactical utilities.

## Ladder search

```ts
import { searchLadder, findLadderedStones } from "./src";

const reading = searchLadder(board, row, col, "black", {
  maxNodes: 20_000,
  maxDepth: 80,
});
if (reading.status === "captured") {
  // A forced capture was found within the search limits.
} else if (reading.status === "escaped") {
  // A valid defense was found, or the attacker has no legal ladder move.
} else {
  // Search limits or unresolved ko history prevented a proof.
}

const ladderMask = findLadderedStones(board, "black");
```

The reader handles direct ladder extensions and considers adjacent-atari countercaptures when the target remains in atari. Defender-turn base cases follow KataGo's liberty threshold before generating local responses. It tracks every initially present point listed in `targetStones`, which may represent multiple disconnected target groups supplied by the caller. (A normal Go move does not split a connected chain.) Candidate thresholds follow the side to move, as in KataGo's reader: the attacker can ladder-attack a group with up to two liberties, while a defender-to-move group with two or more liberties is already out of the ladder. This is evaluated per group, so a safe fragment does not terminate the read while another listed group remains in atari. The result is existential across the original target: `captured` means at least one originally surviving fragment is forced to be captured; `escaped` means no remaining fragment is currently ladderable or a valid defense was found. When `targetStones` is supplied, at least one listed original stone must still be present in the starting position (other listed stones may already have been captured by the setup move). It detects repeated board/side-to-move states as unresolved ko cycles, and passes the explored path to the optional `isLegalMove` hook. Callers can seed `initialPath` with `boardKey(board) + "|" + sideToMove` entries from the real game history to enforce situational repetition policies; the current root entry is accepted and removed from the ancestor set before searching. The legality hook receives that history plus the current position being played from; the escape-point helper also carries its setup-attack parent position into the defender-first read. The reader does not memoize by board alone: repetition depends on the exact search path, so identical board/side states reached through different paths may have different outcomes. A resource cutoff always returns `unknown`. If every generated defender response is illegal under the board rules, the branch is a proven ladder capture, matching KataGo's treatment of illegal local replies. If a caller-supplied ko/superko legality hook rejects candidate moves, the result remains `unknown` because the hook may be withholding a repetition-dependent response. A proven result keeps its own reason even if another explored branch hit a resource cutoff.

This is a deliberately bounded ladder reader, not yet a byte-for-byte port of KataGo's `Board::iterLadders` implementation. It now includes KataGo's conservative double-ko-death shortcut: both target liberties must be ko mouths (surrounded by the defender color or board edges, with exactly one adjacent capturable one-stone defender chain), a defender connection at either ko mouth must leave at most two liberties, and the target must have no adjacent attacker chain in atari that it could capture for extra liberties. This is a local heuristic for double-ko death, not complete finite ko-threat accounting; KataGo itself documents the shortcut as incomplete. The TypeScript implementation now ports KataGo's `getBoundNumLibertiesAfterPlay` calculation and uses its lower bound to short-circuit a defender extension when a single target chain is provably left with at least three liberties. The upper bound is computed alongside it but is not yet used for the single-response attacker-win shortcut: that optimization must additionally prove the defender response is the only legal candidate, the attacker capture is legal under the caller's history policy, the resulting state is not a repetition, and the tracked target stones are actually removed. The source-derived corpus includes an upper-bound-at-most-one capture shape, but deliberately verifies it through ordinary recursive play rather than treating the bound alone as a capture proof. For the double-ko test, post-play liberties are checked by applying the move to a copied board rather than porting KataGo's specialized capped-liberty walk. Full snapback/ko-threat reading, pass-aware tactical escapes beyond the local ladder candidate set, and exact feature parity still need comparison against an executable official KataGo reference. The source-derived TypeScript regression suite remains in `katago-ladder-reference.test.ts`; its double-ko guard regression also covers the case where both ko mouths qualify but a defender connection would leave three liberties, which must not trigger the shortcut. The shared JSON corpus keeps the official C++ `expected` result separate from optional `typescriptExpected`, since the TS reader can return `unknown` where KataGo's boolean API returns `escaped` after its own node-budget cutoff. A mirrored, language-neutral corpus is published at `tests/katago-ladder/reference-cases.json`, with a JSON Schema and an external-oracle protocol. A test-only C++ adapter now calls the official `Board::searchIsLadderCaptured` method directly; `.github/workflows/ci.yml` builds it against pinned official KataGo commit `d91ea855110dae533f0aada947b2b7d78cc8a4e1` and runs `scripts/compare_katago_ladder_oracle.py` against the shared corpus. This C++ build is isolated to CI and is not included in the browser runtime. Important API limitation: KataGo's method returns only `bool`, not a tri-state result; its internal node-budget cutoff returns `false`, so the adapter reports that as `escaped` while explicitly marking `unknownStatusAvailable: false`. This is an exact differential check of the official method's return values, not proof that every `escaped` return represents a proven legal escape. The TypeScript reader's `unknown` semantics therefore remain intentionally more conservative. The history hook provides the information needed for a caller-supplied ko policy; it does not itself implement every ruleset.

## Pass-alive area

```ts
import { calculatePassAliveArea } from "./src";

const result = calculatePassAliveArea(board);
result.passAliveStones[row][col]; // Benson-unconditionally-alive stone?
result.owners[row][col];          // "black", "white", or null
```

The implementation uses Benson's fixed-point elimination of chains with fewer than two vital regions. It assigns only conservative pass-alive empty regions; unresolved points remain `null`.

This is not yet a full replacement for KataGo's `Board::calculateArea`. Suicide-rule overrides, seki tax, safe/unsafe big territories, and KataGo's exact area-region policy remain future parity work.

## V7 feature encoder integration

The V7 encoder accepts explicit ladder masks and area ownership; `deriveV7RuleFeatures` now computes the current and two historical ladder masks plus `opponentEscape` from the supplied board snapshots. The bounded search means these planes are useful TS-derived features, but are not yet asserted byte-identical to KataGo's official implementation.


## V7 feature adapter

The runtime package now exposes `deriveV7RuleFeatures` to derive the current and two historical ladder masks and convert Benson pass-alive ownership into the V7 self/opponent encoding.

The V7 adapter now derives `opponentEscape` in TypeScript. For each opponent chain with exactly two liberties, it tests each legal attacking liberty and marks the move when a defender-first ladder read proves capture, matching the role of KataGo `iterLadders` working-move points. Callers may still inject a precomputed mask. This is a semantic port of the escape-point procedure, not yet a byte-for-byte parity guarantee: the underlying ladder reader remains bounded and lacks full KataGo handling for ko, snapback, and complex chain changes.


### Generated KataGo ladder differential corpus

The CI oracle job deterministically generates 96 additional legal 9x9 local
positions (seed `20261113`) with target chains in one to three liberties.
The generator rejects positions containing any zero-liberty setup group,
labels accepted positions by calling the pinned official C++ adapter, and
writes both `tests/katago-ladder/generated-cases.json` and the TypeScript
test-data module. CI replays the generated corpus against the official oracle
and then runs every position through the TypeScript reader. The differential
test is a strict gate: every TypeScript status must exactly match the pinned
KataGo boolean result mapping (`captured` or `escaped`); `unknown` and any
status divergence fail the job. This mapping is specific to the current
fixtures and does not remove the documented semantic limitation that the
official API does not expose an `unknown` state.

The generator is deterministic and separately unit-tested for seed
reproducibility, live setup groups, and target-liberty constraints. The
generated corpus is recreated in CI and uploaded as a workflow artifact; it
is not committed as a static, hand-maintained snapshot.
