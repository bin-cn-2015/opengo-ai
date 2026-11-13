# OpenGo AI

Open-source, browser-first Go AI powered by KataGo neural network models.

> **Status:** Early development. This repository bootstrap is the first implementation milestone; KataGo model loading and browser inference are not implemented yet.

## Goals

- Play Go in the browser on 9×9, 13×13, and 19×19 boards.
- Implement Go rules and search in TypeScript, independently of KataGo's search engine.
- Use official pretrained KataGo models (no model training).
- Implement the engine/runtime in TypeScript with WASM, WebGL, and WebGPU inference backends.
- Support the current official KataGo Transformer models (model version 17+), verified against reference outputs.
- Import/export SGF and review games move by move.
- Run locally and offline after application/model assets are cached.

## Development

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
npm test
npm run build
```

## Planned architecture

- `apps/web` — browser UI
- `packages/go-engine` — board state and rules
- `packages/mcts` — PUCT/MCTS search
- `packages/katago-runtime` — TypeScript model pipeline, inference orchestration, and backend selection
- ONNX Runtime Web (initial execution provider) — WASM, WebGL, and WebGPU tensor execution; custom kernels/adapters where needed
- `packages/sgf` — SGF parser and serializer
- `packages/analysis` — game review and analysis
- `workers` — background inference/search workers

The initial scaffold keeps the first playable UI at the repository root while these packages are introduced incrementally.

## KataGo browser runtime

The TypeScript-first architecture, current Transformer target, model licensing notes, and backend parity gates are documented in [KATAGO_BROWSER_RUNTIME.md](./KATAGO_BROWSER_RUNTIME.md). KataGo model loading and browser inference remain unimplemented until the documented parity checks pass.

## Model compatibility

The first reproducible import path may convert official `.bin.gz` weights to ONNX using KataGo's official `dumponnx` build-time tool. Browser inference, feature encoding, output decoding, and search remain TypeScript. A fully TypeScript `.bin.gz` importer is a separate milestone. WASM, WebGL, and WebGPU must each pass operator-coverage and numerical-parity tests against the latest official Transformer model.

## License

OpenGo AI's own license will be selected before the first public release. Official kata1 model weights have a separate permissive license; see the [KataGo network license](https://katagotraining.org/network_license/). Retain its required copyright and permission notice when redistributing weights.
