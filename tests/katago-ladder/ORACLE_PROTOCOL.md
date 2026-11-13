# KataGo ladder oracle adapter protocol

The shared fixtures in `reference-cases.json` are the input contract for a
test-only executable that reads one JSON object from stdin and writes one JSON
object to stdout. The adapter calls the official
`Board::searchIsLadderCaptured` implementation directly; it does not emulate
the algorithm and is not part of the browser runtime.

## Request

Each request is one fixture object (see `oracle-case.schema.json`):

- `size`: board width/height (square board)
- `stones`: `[color, row, col]` entries, with zero-based coordinates
- `target`: target point
- `attacker`: attacking color
- `firstPlayer`: `attacker` or `defender`
- `expected` and `provenance`: official-oracle expectation and source metadata
- `typescriptExpected`: optional TypeScript tri-state expectation; ignored by the C++ oracle

The adapter initializes KataGo's Zobrist hashes, overlays the complete setup
with `Board::setStonesTolerant`, and then calls
`searchIsLadderCaptured(target, firstPlayer == "defender", workingMoves)`.
Coordinates are converted with KataGo's `Location::getLoc(col, row, size)`.

## Response and semantic limitation

Example:

```json
{"id":"double-ko-death","status":"captured"}
```

The response preserves the request `id`. `status` is `captured` or
`escaped`, reflecting the official C++ method's boolean return. The current
KataGo API does not expose an `unknown` result: in particular, its internal
25,000-node budget returns `false`, which this adapter must report as
`escaped`. Therefore an `escaped` response is an exact report of the
official method's return value, not a claim that KataGo proved a legal escape.
The response includes `unknownStatusAvailable: false` to make this limitation
machine-visible. The TypeScript reader's tri-state semantics are not directly
comparable to this bool API in resource-limited cases.

## Pinned source and CI

The CI oracle job checks out official KataGo commit
`d91ea855110dae533f0aada947b2b7d78cc8a4e1`, builds the test-only adapter
using `tests/katago-ladder/cpp-oracle/CMakeLists.txt`, then runs:

```sh
python3 scripts/compare_katago_ladder_oracle.py --oracle ./build/katago-ladder-oracle/katago-ladder-oracle
```

The runner starts one adapter process per fixture, checks response IDs and
statuses, enforces a timeout, and exits nonzero on mismatch. The adapter links
the pinned KataGo core sources and board implementation; no C++ files are
included in the production browser bundle.
