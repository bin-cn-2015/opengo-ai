# OpenGo AI

Open-source, browser-first Go AI powered by KataGo neural network models.

> **Status:** Early development. This repository bootstrap is the first implementation milestone; KataGo model loading and browser inference are not implemented yet.

## Goals

- Play Go in the browser on 9×9, 13×13, and 19×19 boards.
- Implement Go rules and search in TypeScript, independently of KataGo's search engine.
- Use official pretrained KataGo models (no model training).
- Explore WebGPU-first inference with WebGL and WASM fallbacks.
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
- `packages/katago-model` — model metadata, feature encoding, output decoding
- `packages/inference/{webgpu,webgl,wasm}` — inference backends
- `packages/sgf` — SGF parser and serializer
- `packages/analysis` — game review and analysis
- `workers` — background inference/search workers

The initial scaffold keeps the first playable UI at the repository root while these packages are introduced incrementally.

## KataGo browser runtime

The P0 feasibility decision, model-format findings, runtime comparison, and verification checklist are tracked in [KATAGO_BROWSER_RUNTIME.md](./KATAGO_BROWSER_RUNTIME.md). KataGo model loading and browser inference remain unimplemented until the documented parity checks pass.

## Model compatibility

KataGo native model files are not interchangeable with ONNX models. Before selecting a browser runtime, we must verify the exact model format, network operations, feature schema, and backend operator coverage. Backend support will be claimed only after correctness and performance tests.

## License

License to be selected before the first public release.
