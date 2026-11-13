# @opengo-ai/katago-runtime

TypeScript-first browser runtime for official KataGo neural-network models. The package does not embed or compile the KataGo C++ engine.

## Implemented

- Runtime API and model/analysis TypeScript contracts.
- Explicit backend selection for WASM, WebGL and WebGPU (`auto`: WebGPU → WebGL → WASM).
- Strict application-level backend selection: an explicitly requested unavailable backend throws.
- KataGo ONNX metadata parser for contract version 1, including model-version checks and rejection of unknown must-understand `katago.*` metadata keys.
- v17 target guard for the `tf3-b11c768` nested-bottleneck Transformer family.
- ONNX graph tensor-name, ordering, dtype and shape validation.
- ONNX Runtime Web session adapter that binds KataGo float32 input tensors and returns the raw policy, value, score and ownership tensors.
- ONNX graph inspection helper that exports operator/domain/opset inventory and metadata sidecars.

## KataGo V7 feature encoder (initial implementation)

`encodeKataGoV7(position, metadata)` is exported from the package. It emits NCHW `InputSpatial` (22 × nnYLen × nnXLen), 19-value `InputGlobal`, and an `InputMask` copied from spatial channel 0. It implements the V7 22-plane layout: board/stones/liberties, ko restrictions, five move-history locations and pass flags, ladder planes, area ownership, and second-encore starting stones. It also validates the model's V7 22/19 input contract and optional InputMeta length.

The encoder takes explicit rule-derived inputs for ladder search masks and pass-alive/independent-life area ownership. These are intentionally not approximated: the current Go rules package does not yet implement KataGo's ladder search and pass-alive area algorithms. The caller must provide those values from a parity-validated rules layer. Likewise, `passWouldEndPhase`, phase-history visibility, ko/superko bans and second-encore starting colors must come from the complete game-history state, not just the visible board.

Example:

```ts
import { encodeKataGoV7 } from "@opengo-ai/katago-runtime";

const tensors = encodeKataGoV7(positionWithHistoryAndDerivedMasks, modelMetadata);
await session.run(tensors);
```

## Not implemented / not yet verified

- Exact end-to-end V7 parity against official KataGo, including native TypeScript ladder-search and pass-alive/independent-life area derivation.
- KataGo output-head semantic decoding (softmax, value perspective, score scaling, ownership transforms).
- MCTS/PUCT search and KataGo analysis parity.
- Automatic browser-side parsing of ONNX `metadata_props`; the current adapter consumes a JSON sidecar.
- Full operator placement audit and numerical parity for the exact current Transformer graph on WebGPU and WebGL.
- End-to-end reference comparison against official KataGo.

A successful ONNX session does **not** prove that all nodes ran on the selected GPU. ONNX Runtime may partition unsupported nodes to CPU. The project must audit the exported graph and verify provider placement and numeric parity before claiming GPU backend support.

## Dependencies

The browser tensor runtime is [ONNX Runtime Web](https://www.npmjs.com/package/onnxruntime-web), pinned by the root package manifest to the stable `^1.31.1` release line. Its WASM, WebGL and WebGPU execution providers are selected explicitly by this package.

## Export and inspect a model

Use KataGo 1.18+ to convert an official `.bin.gz` model offline:

```sh
katago dumponnx -model model.bin.gz -out model.onnx
python -m pip install onnx
python scripts/inspect_katago_onnx.py model.onnx \\
  --report model.graph-report.json \\
  --metadata model.metadata.json
```

Do not commit model weights or generated multi-megabyte ONNX graphs. Keep the model file and its metadata sidecar together in the model distribution. Record the KataGo version, conversion flags and source model SHA-256 alongside the report.

The metadata sidecar is required because the ONNX Runtime Web `InferenceSession` API exposes tensor names/shapes but not ONNX ModelProto `metadata_props`. The inspector extracts the exact values from the graph at build time.

## Create a session

```ts
import { createKataGoOnnxSession } from "@opengo-ai/katago-runtime";

const session = await createKataGoOnnxSession({
  model: "/models/kata1-tf3-b11c768.onnx",
  metadata: modelMetadataJson,
  backend: "auto",
  capabilities: {
    wasm: true,
    webgl: true,
    webgpu: typeof navigator !== "undefined" && "gpu" in navigator,
  },
  requireTargetTransformerV17: true,
});

// The caller supplies KataGo V7-encoded float32 features.
// run() returns raw ONNX heads; it does not yet decode KataGo policy/value semantics.
const rawHeads = await session.run({
  spatial,
  global: globalFeatures,
  mask,
});
await session.dispose();
```

## Important backend limitation

The adapter asks ONNX Runtime Web to use exactly one selected provider. Provider selection alone cannot guarantee that every node executes there: unsupported nodes may be assigned to CPU. WebGL is also documented by ONNX Runtime as maintenance mode, while WebGPU operator support is a subset. All three remain project acceptance targets; none is declared fully validated yet.

See [KataGo browser runtime plan](../../KATAGO_BROWSER_RUNTIME.md).
