# @opengo-ai/katago-runtime

TypeScript-first browser runtime for official KataGo neural-network models.

## Current implementation status

This package currently provides:

- TypeScript API contracts for model metadata, board analysis requests, candidate moves, and streaming analysis updates.
- Deterministic backend selection: `auto` prefers WebGPU → WebGL → WASM.
- Strict explicit selection: requesting an unavailable backend throws; it never silently falls back.
- Unit tests for backend selection and invalid backend configuration.

Not implemented yet:

- ONNX model loading and execution.
- KataGo model metadata parsing and model-version compatibility checks.
- KataGo feature encoding and output decoding.
- Transformer graph/operator compatibility for the current official model.
- MCTS/PUCT search and KataGo analysis parity.

The package deliberately does not wrap or compile the KataGo C++ engine.

## Model import plan

The first supported import path is an ONNX export generated offline with the official KataGo `dumponnx` tool. The browser runtime and search implementation remain TypeScript. A native `.bin.gz` parser/exporter written in TypeScript is a later milestone; it is not claimed to exist yet.

## Backend policy

- `wasm`: correctness/reference backend and broad ONNX operator coverage.
- `webgpu`: preferred GPU backend where the browser and model graph support it.
- `webgl`: retained as a required target, subject to its narrower operator coverage and maintenance status in ONNX Runtime Web.

The adapter selects one provider explicitly, but ONNX Runtime may partition unsupported nodes to its CPU provider. Therefore a successful session is not proof of full GPU execution. Before claiming WebGPU or WebGL support, audit every operator in the exact exported Transformer graph and verify provider placement plus numerical parity. The current package does not yet claim that GPU audit has passed.

See [KataGo browser runtime plan](../../KATAGO_BROWSER_RUNTIME.md).
