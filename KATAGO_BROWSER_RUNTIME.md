# OpenGo AI: TypeScript KataGo Runtime Plan

Date: 2026-11-13

## Product decision (supersedes the earlier C++ fork recommendation)

OpenGo AI's engine/runtime will be implemented and maintained in TypeScript. Do not adopt `saigo-online/katago-webgpu` or another KataGo C++ fork as the product runtime.

Hard requirements:
- browser runtime API and orchestration in TypeScript;
- WASM, WebGL and WebGPU execution backends;
- latest official KataGo transformer network support, not only legacy convolutional networks;
- official pretrained weights, no user training step;
- real KataGo-compatible feature encoding, output decoding and search semantics;
- worker-based analysis so inference/search do not block the UI.

The previous C++ fork investigation remains historical research only. It is not the selected architecture.

## Current official target model

As checked 2026-11-13, the official kata1 networks page lists:

`kata1-tf3-b11c768-s12382M-d6533M`

Uploaded 2026-11-01. This is the current acceptance-test model, not a promise that every later model will load automatically.

Architecture family: `tf3-b11c768`, model version 17:
- 11 nested bottleneck transformer blocks, with 3 inner transformer blocks per NBT3 block;
- trunk width 768, bottleneck width 384;
- 12 attention heads, head dimension 32;
- learned two-dimensional RoPE;
- SwiGLU feed-forward blocks, hidden width 1152;
- SiLU activations;
- RMSNorm in attention/feed-forward sublayers;
- convolutional stem and KataGo policy/value/score/ownership heads.

The implementation must read model metadata and reject unsupported configurations explicitly. Do not infer the architecture from a filename alone.

References:
- https://katagotraining.org/networks/
- https://github.com/lightvector/KataGo/blob/master/docs/NetworkArchitectures.md
- https://github.com/lightvector/KataGo/blob/master/cpp/neuralnet/modelversion.cpp

## License

The official kata1 network weights are covered by the KataGo Neural Network License, a permissive MIT-style license. It requires retaining the copyright and permission notice. The current listing's exact network is in the kata1 run, so this license applies.

The KataGo engine/source repository is also permissively licensed for its own content, with separately licensed bundled dependencies and explicitly attributed third-party code. If we port algorithms or reuse source fragments, preserve the relevant notices and audit each file's provenance. A clean-room TypeScript implementation based on documented behavior should keep its own license and attribution records clear.

Do not assume all third-party networks on the extra_networks page share the same license. Check each model's attribution and license before offering it in the model catalog.

References:
- https://katagotraining.org/network_license/
- https://github.com/lightvector/KataGo/blob/master/LICENSE

## Selected technical architecture

### TypeScript engine layer

Create a standalone package `packages/katago-runtime`, independent of React. It owns:
- model manifest/metadata and version compatibility;
- KataGo model import/validation pipeline;
- V7 feature generation and history-sensitive board inputs;
- inference session lifecycle and backend selection;
- output-head decoding (policy, value, score, ownership, optional auxiliary heads);
- legal move filtering and KataGo-compatible MCTS/PUCT/search policy;
- analysis result streaming, PV, visits, winrate and score;
- Web Worker protocol and cancellation/disposal.

No C++ KataGo engine is linked into the browser product.

### Tensor execution layer

First P0 candidate: ONNX Runtime Web, called from TypeScript, using its WASM, WebGL and WebGPU execution providers. This is a TypeScript-facing browser runtime, not the KataGo C++ engine.

Official KataGo provides `dumponnx` (KataGo 1.18+) to turn a native `.bin.gz` into the ONNX graph used by its ONNX backend. This is a conversion/build-time tool, not part of browser inference. For the first proof, allow a reproducible conversion step in CI/dev tooling, then load the resulting ONNX file in the TypeScript browser runtime.

Important distinction:
- browser inference and search remain TypeScript + ONNX Runtime Web;
- the first model conversion may use the official KataGo `dumponnx` executable;
- if the project later requires a completely TypeScript-only model-import pipeline, implement a TypeScript parser/graph exporter for the native model format as a separate milestone. Do not pretend this exists now.

Official model conversion documentation:
- https://github.com/lightvector/KataGo/blob/master/docs/ONNX_Model_Files.md

### Backend contract

Expose all three as explicit selectable backends:

```ts
export type Backend = "auto" | "wasm" | "webgl" | "webgpu";

export interface RuntimeOptions {
  backend: Backend;
  model: string | ArrayBuffer;
  boardSize?: number;
}

export interface KataGoRuntime {
  load(): Promise<ModelInfo>;
  analyze(request: AnalyzeRequest): AsyncIterable<AnalysisUpdate>;
  dispose(): Promise<void>;
}
```

`auto` should probe WebGPU first, then WebGL, then WASM. Explicit backend selection must fail with a useful compatibility error instead of silently switching.

WASM is the correctness/reference fallback and must support the full operator graph. WebGPU is the preferred accelerated backend where available. WebGL is a hard requirement but must be treated as a separate compatibility/performance target: ONNX Runtime's current documentation describes WebGL as maintenance mode. We must pin and test a supported ORT version, and be prepared to implement custom WebGL kernels or a backend adapter for any unsupported ONNX nodes. Never claim WebGL support just because a WebGL session can be created.

Official runtime references:
- https://onnxruntime.ai/docs/get-started/with-javascript/web.html
- https://onnxruntime.ai/docs/tutorials/web/
- https://github.com/microsoft/onnxruntime/blob/main/js/web/docs/webgpu-operators.md
- https://github.com/microsoft/onnxruntime/blob/main/js/web/docs/webgl-operators.md

## Transformer compatibility risks

The latest tf3 model requires more than generic convolution support:
- nested bottleneck residual structure;
- 2D learned RoPE;
- multi-head self-attention;
- RMSNorm;
- SwiGLU;
- SiLU;
- model-version-17 feature and output contracts.

ONNX Runtime Web documents that WASM supports all ONNX operators, while WebGL and WebGPU support subsets. WebGL is maintenance mode. The WebGPU operator table includes MatMul and other building blocks, but the exact graph emitted by KataGo's `dumponnx` must be inspected against both GPU provider operator tables.

P0 must export the exact current tf3 model and inspect every ONNX node/domain/opset. If the graph uses a fused/custom operator unavailable on WebGL or WebGPU, either:
1. change the export graph to decompose it into standard supported ONNX operations; or
2. implement and test a custom provider kernel; or
3. use a TypeScript tensor-graph implementation for that operation.

No backend is considered supported until the same fixed test positions produce outputs within documented numeric tolerances of the WASM reference and the native official KataGo reference.

## Search implementation

Inference is not the full KataGo analysis engine. Implement the search layer in TypeScript after inference parity:
- board history and rules-aware legality;
- policy priors and value/score interpretation;
- batched leaf evaluation;
- PUCT selection and backup;
- root noise/temperature only where the selected analysis/play mode requires it;
- tree reuse, stop/cancel, analysis streaming;
- candidate-move statistics and principal variations.

The existing Go rules package can be reused only after a parity audit for ko/superko, rulesets, pass handling, history features and board sizes. Search must not be described as KataGo-equivalent until matched against official KataGo analysis on fixed fixtures.

## P0 implementation gates

1. Create `packages/katago-runtime` with backend abstraction and model metadata types.
2. Obtain one small official v17 transformer model and the exact current tf3-b11c768 model; do not commit weights.
3. Convert both with the official `dumponnx` tool and archive conversion commands, tool version and SHA-256 hashes.
4. Inspect ONNX metadata, inputs, outputs, opsets and all node/operator domains. Produce a machine-readable compatibility report for WASM, WebGL and WebGPU.
5. Run one inference in WASM and compare all heads against official KataGo reference output.
6. Run the same fixture in WebGPU and WebGL. Compare outputs to WASM within explicit tolerances. Fix missing operators rather than silently falling back.
7. Implement TypeScript feature encoding and verify tensor parity against official KataGo-generated inputs.
8. Implement TypeScript output decoding and compare policy/value/score/ownership semantics.
9. Implement TypeScript search, then compare visits, candidate ranking, winrate/score and PV against official KataGo. Document expected nondeterminism and tolerances.
10. Add CI tests for all exportable operator graphs and runtime smoke tests. Browser GPU integration tests may use a dedicated browser runner.

## Non-goals until inference parity

- No further board UI, SGF or scoring features.
- No C++ KataGo runtime or C++ search engine in the shipped browser application.
- No hand-written approximation of the transformer.
- No support claim based only on model metadata parsing or successful ONNX session creation.
- No model weights committed to Git.
- No dropping WebGL from the acceptance criteria without an explicit product decision.

## Implementation status (updated after the first inference-layer commits)

Implemented in `packages/katago-runtime`:
- TypeScript runtime contracts and deterministic WASM/WebGL/WebGPU selection.
- KataGo ONNX metadata contract parser, including modelVersion 17 target guard for the `tf3-b11c768` family.
- ONNX input/output name, order, dtype and tensor-shape validation.
- ONNX Runtime Web session loader that creates a session for the selected provider and binds KataGo float32 input tensors; raw policy/value/score/ownership heads are returned.
- `scripts/inspect_katago_onnx.py` extracts the ONNX operator/domain/opset inventory and `katago.*` metadata into JSON reports/sidecars.
- Root dependency `onnxruntime-web` is pinned to the stable 1.31.1 release line.
- V7 feature encoder initial implementation: NCHW 22-plane spatial tensor, 19 global features, InputMask, history/pass planes, ko planes, relative area planes, second-encore planes, and model/input dimension validation. It consumes explicit ladder masks and pass-alive/independent-life area ownership; those expensive rule-derived algorithms are not yet implemented in TypeScript or parity-validated.

Still not implemented or verified:
- Actual export and inspection of the exact current official `kata1-tf3-b11c768-s12382M-d6533M` weights.
- Exact end-to-end V7 parity against official KataGo, including native TypeScript ladder-search and pass-alive/independent-life area derivation.
- KataGo output semantic decoding and numerical parity.
- TypeScript MCTS/PUCT and analysis parity.
- Full operator-placement audit and numerical parity for all three execution backends.

Important: ONNX Runtime Web exposes tensor input/output metadata but not the ONNX ModelProto `metadata_props` through its browser `InferenceSession` API, so the current loader takes a sidecar emitted by the build-time inspection script. Selecting a GPU execution provider does not prove every node runs on that GPU; unsupported nodes may be partitioned to CPU. WebGPU/WebGL are not declared validated until the exact graph is audited and provider placement is verified.

No KataGo C++ engine is linked or wrapped by the browser runtime.
