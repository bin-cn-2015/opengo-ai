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

The reader handles direct ladder extensions and adjacent-atari countercaptures. It uses the board's local capture/suicide rules. Simple ko and superko history are not stored in a bare `Board`; callers must supply `isLegalMove` to reject history-illegal moves. A resource cutoff always returns `unknown`.

This is a deliberately bounded ladder reader, not yet a byte-for-byte port of KataGo's `Board::iterLadders` implementation. In particular, multi-chain splitting, snapback, ko threats, and broader tactical escapes still need parity tests against official KataGo.

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

The V7 encoder currently accepts ladder masks and area ownership as explicit inputs. These functions provide the rule-derived primitives, but the adapter that derives all four KataGo V7 ladder planes from current/recent board history is not yet complete. Do not substitute zero masks and claim exact model parity.
