# KataGo Browser Runtime: P0 Feasibility and Integration Decision

Date: 2026-11-13

## Executive decision

Do not implement KataGo's neural-network architecture or search from scratch in TypeScript yet.

The strongest candidate found is [saigo-online/katago-webgpu](https://github.com/saigo-online/katago-webgpu), a KataGo-derived C++ fork that adds:
- a WebGPU neural-network backend using WGSL/Dawn;
- a browser WASM build using Emscripten and Dawn's `emdawnwebgpu` port;
- an Eigen CPU path intended to serve as a fallback;
- a minimal `kataeval` C ABI for model loading and neural-net evaluation;
- a separate threaded WASM build path that includes KataGo's actual search implementation.

Its README and engineering log report parity checks against KataGo's Eigen reference, including transformer modelVersion 17. These are upstream project claims and still need to be reproduced in our own build/test environment before we treat them as verified OpenGo AI behavior.

Candidate repository:
- https://github.com/saigo-online/katago-webgpu
- inspected commit: `d5ad1c0423dba989c60a2f06b1848e7eec2b5941` (2026-07-03)
- license file states MIT for the repository's own content, with separate notices/licenses for bundled dependencies and files.

## What the official model format means

KataGo's official `.bin.gz` is a native KataGo model format, not an ONNX file.

KataGo 1.18.0+ provides:
```bash
katago dumponnx -model model.bin.gz -out model.onnx
```

The official documentation explicitly says the TensorRT and ONNX Runtime backends translate `.bin.gz` into an ONNX graph; they do not feed the compressed native file directly to ONNX Runtime. CUDA, OpenCL, Eigen and Metal backends read `.bin.gz` directly.

Even a valid ONNX graph is not sufficient by itself: KataGo-specific metadata defines the model version, feature encoding, output channel counts, board-buffer size, and output post-processing. A generic ONNX inference wrapper would still need KataGo-compatible input feature generation and output decoding.

Official reference:
- https://github.com/lightvector/KataGo/blob/master/docs/ONNX_Model_Files.md
- https://github.com/lightvector/KataGo/blob/master/cpp/neuralnet/modelversion.cpp

The inspected official model-version source currently declares:
- supported model versions: 3 through 17;
- latest input feature version: V7;
- model versions 8–17 use V7 input features.

For the currently documented v17 contract, the ordinary model input has 22 spatial channels and 19 global channels; the actual model header/metadata must be read rather than hard-coded as a universal rule.

## Current official model generation

The official KataGo network listing currently identifies `kata1-tf3-b11c768-s12382M-d6533M` as the latest network (uploaded 2026-11-01). The current strongest family is transformer-based.

This matters because compatibility with an older g170 convolutional model is not sufficient evidence that a runtime can load the current official network. The candidate fork reports support through modelVersion 17, including transformer blocks, RoPE, SwiGLU, RMSNorm and grouped-query attention, but it also explicitly rejects some configurations (including grouped RMSNorm and nonzero SGF metadata encoder versions).

Therefore, loading the exact current official network is a required P0 test. Do not label “all official models supported” based only on a small v17 test network.

Official network listing:
- https://katagotraining.org/networks/

## Candidate runtime assessment

| Capability | Candidate status | OpenGo AI decision |
|---|---|---|
| Read official `.bin.gz` | Candidate uses KataGo's native C++ model loader | Test with a downloaded official model |
| WASM CPU inference | Candidate builds Eigen CPU into WASM | First fallback target |
| WebGPU inference | Candidate adds WGSL/Dawn backend | Preferred browser acceleration target |
| WebGL inference | No WebGL backend identified in candidate | Not available in P0; evaluate separately |
| KataGo MCTS/search | Candidate documents a threaded WASM build including KataGo's real Search/AsyncBot | Prefer this over a new TS search implementation, subject to reproduction |
| PV / candidate moves | Candidate demo reports search stream and PV | Validate output semantics and API |
| Current largest v17 model | Candidate claims broad v17 support but lists unsupported model features | Explicit compatibility gate; not yet verified |
| Web worker execution | Candidate uses pthread workers for threaded build | Required to keep analysis off the UI thread |

### Why ONNX Runtime Web is not the default path

ONNX Runtime Web supports WASM and WebGPU, but WebGPU operator coverage is a subset of the ONNX operator set. Its WebGL backend is legacy/maintenance-oriented, and the ONNX Runtime repository has a design proposal to remove it in favor of WebGPU or WASM.

This makes ONNX attractive as an interoperability route, but not the shortest path to complete KataGo compatibility. The native KataGo C++ path already knows how to parse `.bin.gz`, build features, decode heads, and perform search.

References:
- https://onnxruntime.ai/docs/get-started/with-javascript/web.html
- https://onnxruntime.ai/docs/tutorials/web/
- https://github.com/microsoft/onnxruntime/blob/main/docs/design/onnxruntime_web_remove_webgl_backend.md

## P0 decision matrix

| Route | Native `.bin.gz` | WASM | WebGPU | WebGL | Search semantics | Decision |
|---|---|---|---|---|---|---|
| Reimplement network + search in TS | Must build parser and all architecture/features | Custom | Custom | Custom | Must reimplement | Reject for now: highest correctness risk |
| Convert to ONNX + ONNX Runtime Web | Requires official `dumponnx` conversion first | Yes | Yes, operator subset | Legacy/at risk | Search still separate | Keep as fallback experiment, not primary |
| Adapt `katago-webgpu` C++ fork | Candidate already uses native loader | Yes | Yes | No identified backend | Candidate includes a real-search threaded build | Recommended P0 path |

## P0 verification checklist

No feature should be marked supported until these checks pass in this repository or in a reproducible CI workflow.

1. Pin the candidate fork to a reviewed commit; record its upstream base and license notices.
2. Build its single-thread WASM target with the Eigen backend and load an official `.bin.gz` model.
3. Evaluate fixed positions and compare policy/value/score/ownership tensors with the same KataGo version's Eigen reference.
4. Build the WebGPU WASM target and compare outputs against the CPU path on a real browser GPU.
5. Download the exact current official network from the official network listing and attempt model load + evaluation. Record any rejected metadata/architecture features.
6. Build the threaded WASM search target in a Web Worker. Compare best move, visits, winrate, score and PV against native KataGo analysis on identical positions/configuration.
7. Measure model download size, peak WASM memory, startup time, NN evaluations/sec and search visits/sec on representative desktop and mobile devices.
8. Only after those pass, expose a stable TypeScript API from `packages/katago-runtime`.

## WebGL policy

Do not block the core runtime on WebGL.

WebGL is not an interchangeable drop-in for WebGPU: it has a different operator/runtime implementation and the candidate C++ fork currently documents WebGPU plus Eigen/WASM, not WebGL. ONNX Runtime's WebGL path is legacy and has a removal proposal. If WebGL remains a hard product requirement, it needs a separate technical spike and compatibility suite; the honest fallback in P0 is WASM CPU.

## Proposed integration boundary

Keep the engine/runtime independent from React:

```ts
export type Backend = "auto" | "webgpu" | "wasm";

export interface KataGoRuntime {
  load(modelUrl: string): Promise<void>;
  analyze(request: {
    board: Int8Array;
    boardSize: number;
    toMove: "black" | "white";
    komi: number;
    rules: string;
    visits: number;
    variations: number;
  }): Promise<AnalysisResult>;
  dispose(): Promise<void>;
}
```

This is a target interface only. It is not implemented yet. The actual ABI must be designed after inspecting the candidate's C ABI and search worker protocol; avoid freezing an API that cannot represent KataGo's rules, history, and analysis semantics.

## Scope guard

Until the P0 verification is complete:
- do not add more board UI, SGF features, scoring features, or game-review features;
- do not add a TypeScript MCTS and call it KataGo search;
- do not add ONNX Runtime merely because it can run browser models;
- do not commit large model weights to this repository;
- do not claim WebGL, current-model compatibility, or full analysis support without passing tests.

The next implementation task is a reproducible WASM build/load/evaluate proof using a small official model first, followed by the exact current official transformer model.
