# KataGo ladder oracle adapter protocol

The shared fixtures in `reference-cases.json` are the input contract for an
external executable that reads one JSON object from stdin and writes one JSON
object to stdout. The executable must be built against the official KataGo C++
source and invoke the internal ladder-reading implementation; a GTP process
alone is not a valid oracle because GTP does not expose
`Board::searchIsLadderCaptured` as a command.

## Request

Each request is one fixture object (see `oracle-case.schema.json`):

- `size`: board width/height (square board)
- `stones`: `[color, row, col]` entries, with zero-based coordinates
- `target`: target point
- `attacker`: attacking color
- `firstPlayer`: `attacker` or `defender`
- `expected` and `provenance`: corpus metadata; the oracle should ignore these
  when computing its result

## Response

Return one JSON object:

```json
{"id":"double-ko-death","status":"captured"}
```

`status` must be exactly `captured`, `escaped`, or `unknown`. The adapter
must return the same `id` as the request. It should map KataGo's internal
ladder result to these three statuses without silently treating resource
cutoffs or unresolved ko as a proof. Additional fields are allowed.

## Run the comparison

After building an adapter against a pinned official KataGo commit:

```sh
python3 scripts/compare_katago_ladder_oracle.py --oracle ./build/katago-ladder-oracle
```

The runner sends each fixture in a separate process invocation, checks the
response ID and status, enforces a timeout, and exits nonzero on any mismatch.
Pin and record the exact KataGo source commit and build options alongside the
adapter. The repository does not currently contain that C++ adapter or vendor
the KataGo C++ runtime, so this command is infrastructure awaiting an actual
official-source adapter; it is not evidence of completed differential testing.
