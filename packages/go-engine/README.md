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

The reader handles direct ladder extensions and adjacent-atari countercaptures. A snapback-style regression fixture verifies that the defender can capture a just-played attacking stone in atari and reopen liberties for the original target chain. It tracks every initially present point listed in `targetStones`, which may represent multiple disconnected target groups supplied by the caller. (A normal Go move does not split a connected chain.) A group with more than two liberties is excluded from the current ladder candidates, but does not terminate the read while another listed group remains threatened. The result is existential across the original target: `captured` means at least one originally surviving fragment is forced to be captured; `escaped` means no remaining fragment is currently ladderable or a valid defense was found. When `targetStones` is supplied, at least one listed original stone must still be present in the starting position (other listed stones may already have been captured by the setup move). It detects repeated board/side-to-move states as unresolved ko cycles, and passes the explored path to the optional `isLegalMove` hook. Callers can seed `initialPath` with prior `boardKey(board) + "|" + sideToMove` entries from the real game history to enforce positional/situational repetition policies. The legality hook receives that history plus the current position being played from; the escape-point helper also carries its setup-attack parent position into the defender-first read. History-dependent searches skip memoization because legality can differ for identical boards reached through different paths. A resource cutoff always returns `unknown`. If the defender has no legal move among the local candidates, the result is also `unknown`, not a claimed capture: the local generator cannot rule out ko threats or off-ladder defenses. A proven result keeps its own reason even if another explored branch hit a resource cutoff.

This is a deliberately bounded ladder reader, not yet a byte-for-byte port of KataGo's `Board::iterLadders` implementation. Full snapback/ko-threat reading, pass-aware tactical escapes beyond the local ladder candidate set, and exact feature parity still need comparison tests against official KataGo. The history hook provides the information needed for a caller-supplied ko policy; it does not itself implement every ruleset.

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
