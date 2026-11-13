import type { BackendCapabilities, BackendPreference, InferenceBackend } from "./types";
import { resolveBackend } from "./backend";
import {
  assertTargetTransformerV17,
  parseKataGoOnnxMetadata,
  type KataGoOnnxMetadata,
  type OnnxMetadata,
} from "./model-metadata";
import { validateKataGoGraphNames } from "./model-contract";

type OrtTensor = {
  readonly type: string;
  readonly data: ArrayLike<number>;
  readonly dims: readonly number[];
};

type OrtTensorConstructor = new (
  type: "float32",
  data: Float32Array,
  dims: number[],
) => unknown;

type OrtSession = {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly inputMetadata: readonly {
    readonly name: string;
    readonly isTensor: boolean;
    readonly type?: string;
    readonly shape?: readonly (number | string)[];
  }[];
  readonly outputMetadata: readonly {
    readonly name: string;
    readonly isTensor: boolean;
    readonly type?: string;
    readonly shape?: readonly (number | string)[];
  }[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
};

type OrtApi = {
  Tensor: OrtTensorConstructor;
  InferenceSession: {
    create(
      model: string | ArrayBuffer,
      options: { executionProviders: string[] },
    ): Promise<OrtSession>;
  };
};

export interface KataGoTensorInput {
  spatial: Float32Array;
  global: Float32Array;
  mask: Float32Array;
  meta?: Float32Array;
  batchSize?: number;
}

export interface KataGoTensorOutput {
  data: Float32Array;
  dims: readonly number[];
}

export type KataGoRawOutputs = Readonly<Record<
  "OutputPolicyPass" | "OutputPolicy" | "OutputValue" | "OutputScoreValue" | "OutputOwnership",
  KataGoTensorOutput
>>;

export interface OnnxSessionOptions {
  model: string | ArrayBuffer | Uint8Array;
  /** Sidecar values copied from ONNX ModelProto.metadata_props by export tooling. */
  metadata: OnnxMetadata;
  backend: BackendPreference;
  capabilities: BackendCapabilities;
  /** Enable only for the official current v17 tf3 nested Transformer acceptance target. */
  requireTargetTransformerV17?: boolean;
}

export interface KataGoOnnxSession {
  readonly backend: InferenceBackend;
  readonly metadata: KataGoOnnxMetadata;
  run(inputs: KataGoTensorInput): Promise<KataGoRawOutputs>;
  dispose(): Promise<void>;
}

function asArrayBuffer(model: string | ArrayBuffer | Uint8Array): string | ArrayBuffer {
  if (typeof model === "string" || model instanceof ArrayBuffer) return model;
  const copy = new Uint8Array(model.byteLength);
  copy.set(model);
  return copy.buffer;
}

async function loadOrt(backend: InferenceBackend): Promise<OrtApi> {
  // WebGPU has a dedicated entry point in ORT Web. WASM and WebGL use the
  // standard browser bundle, with the requested provider passed explicitly.
  const loaded = backend === "webgpu"
    ? await import("onnxruntime-web/webgpu")
    : await import("onnxruntime-web");
  return loaded as unknown as OrtApi;
}

function checkTensorMetadata(
  label: string,
  actual: OrtSession["inputMetadata"][number] | OrtSession["outputMetadata"][number],
  expected: readonly (number | null)[],
): void {
  if (!actual.isTensor || actual.type !== "float32") {
    throw new Error(`KataGo ${label} must be a float32 tensor.`);
  }
  const shape = actual.shape ?? [];
  if (shape.length !== expected.length) {
    throw new Error(`KataGo ${label} rank mismatch: expected ${expected.length}, got ${shape.length}.`);
  }
  for (let i = 0; i < expected.length; i += 1) {
    const wanted = expected[i];
    const got = shape[i];
    if (wanted !== null && got !== wanted) {
      throw new Error(`KataGo ${label} dimension ${i} mismatch: expected ${wanted}, got ${got}.`);
    }
  }
}

function validateSessionTensors(
  session: OrtSession,
  metadata: KataGoOnnxMetadata,
): void {
  validateKataGoGraphNames(metadata, {
    inputNames: session.inputNames,
    outputNames: session.outputNames,
  });

  const inputByName = new Map(session.inputMetadata.map(value => [value.name, value]));
  const outputByName = new Map(session.outputMetadata.map(value => [value.name, value]));
  const inputShape = [null, metadata.numInputChannels, metadata.nnYLen, metadata.nnXLen] as const;
  checkTensorMetadata("InputSpatial", inputByName.get("InputSpatial")!, inputShape);
  checkTensorMetadata("InputGlobal", inputByName.get("InputGlobal")!, [
    null, metadata.numInputGlobalChannels, 1, 1,
  ]);
  checkTensorMetadata("InputMask", inputByName.get("InputMask")!, [
    null, 1, metadata.nnYLen, metadata.nnXLen,
  ]);
  if (metadata.metaEncoderVersion > 0) {
    checkTensorMetadata("InputMeta", inputByName.get("InputMeta")!, [
      null, metadata.numInputMetaChannels, 1, 1,
    ]);
  }

  checkTensorMetadata("OutputPolicyPass", outputByName.get("OutputPolicyPass")!, [
    null, metadata.numPolicyChannels, 1, 1,
  ]);
  checkTensorMetadata("OutputPolicy", outputByName.get("OutputPolicy")!, [
    null, metadata.numPolicyChannels, metadata.nnYLen, metadata.nnXLen,
  ]);
  checkTensorMetadata("OutputValue", outputByName.get("OutputValue")!, [
    null, metadata.numValueChannels, 1, 1,
  ]);
  checkTensorMetadata("OutputScoreValue", outputByName.get("OutputScoreValue")!, [
    null, metadata.numScoreValueChannels, 1, 1,
  ]);
  checkTensorMetadata("OutputOwnership", outputByName.get("OutputOwnership")!, [
    null, metadata.numOwnershipChannels, metadata.nnYLen, metadata.nnXLen,
  ]);
}

function assertLength(name: string, data: Float32Array, expected: number): void {
  if (data.length !== expected) {
    throw new Error(`${name} tensor length mismatch: expected ${expected}, got ${data.length}.`);
  }
}

/**
 * Creates a real ONNX Runtime Web session around a KataGo-exported ONNX graph.
 * The metadata sidecar is required because ORT Web exposes tensor metadata but
 * does not expose ONNX ModelProto.metadata_props through InferenceSession.
 */
export async function createKataGoOnnxSession(
  options: OnnxSessionOptions,
): Promise<KataGoOnnxSession> {
  const metadata = parseKataGoOnnxMetadata(options.metadata);
  if (options.requireTargetTransformerV17) assertTargetTransformerV17(metadata);

  const backend = resolveBackend(options.backend, options.capabilities);
  const ort = await loadOrt(backend);
  const session = await ort.InferenceSession.create(asArrayBuffer(options.model), {
    executionProviders: [backend],
  });

  try {
    validateSessionTensors(session, metadata);
  } catch (error) {
    await session.release();
    throw error;
  }

  let disposed = false;
  const boardArea = metadata.nnXLen * metadata.nnYLen;

  return {
    backend,
    metadata,
    async run(inputs): Promise<KataGoRawOutputs> {
      if (disposed) throw new Error("Cannot run inference after the KataGo ONNX session has been disposed.");
      const batchSize = inputs.batchSize ?? 1;
      if (!Number.isInteger(batchSize) || batchSize <= 0) {
        throw new Error("batchSize must be a positive integer.");
      }

      assertLength("InputSpatial", inputs.spatial, batchSize * metadata.numInputChannels * boardArea);
      assertLength("InputGlobal", inputs.global, batchSize * metadata.numInputGlobalChannels);
      assertLength("InputMask", inputs.mask, batchSize * boardArea);
      if (metadata.requireExactNNLen && inputs.mask.some(value => value !== 1)) {
        throw new Error("This ONNX graph requires an exact full-size board buffer; InputMask must contain only 1s.");
      }
      if (inputs.mask.some(value => value !== 0 && value !== 1)) {
        throw new Error("InputMask values must be binary (0 or 1).");
      }
      if (metadata.metaEncoderVersion > 0) {
        if (!inputs.meta) throw new Error("This model requires InputMeta features.");
        assertLength("InputMeta", inputs.meta, batchSize * metadata.numInputMetaChannels);
      } else if (inputs.meta) {
        throw new Error("InputMeta was provided for a model without a metadata encoder.");
      }

      const tensor = (data: Float32Array, dims: number[]) =>
        new ort.Tensor("float32", data, dims);
      const feeds: Record<string, unknown> = {
        InputSpatial: tensor(inputs.spatial, [
          batchSize, metadata.numInputChannels, metadata.nnYLen, metadata.nnXLen,
        ]),
        InputGlobal: tensor(inputs.global, [batchSize, metadata.numInputGlobalChannels, 1, 1]),
        InputMask: tensor(inputs.mask, [batchSize, 1, metadata.nnYLen, metadata.nnXLen]),
      };
      if (inputs.meta) {
        feeds.InputMeta = tensor(inputs.meta, [batchSize, metadata.numInputMetaChannels, 1, 1]);
      }

      const raw = await session.run(feeds);
      const output = (name: keyof KataGoRawOutputs): KataGoTensorOutput => {
        const value = raw[name];
        if (!value || value.type !== "float32" || !(value.data instanceof Float32Array)) {
          throw new Error(`KataGo output ${name} was not returned as a float32 tensor.`);
        }
        return { data: value.data, dims: value.dims };
      };

      return {
        OutputPolicyPass: output("OutputPolicyPass"),
        OutputPolicy: output("OutputPolicy"),
        OutputValue: output("OutputValue"),
        OutputScoreValue: output("OutputScoreValue"),
        OutputOwnership: output("OutputOwnership"),
      };
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      await session.release();
    },
  };
}
