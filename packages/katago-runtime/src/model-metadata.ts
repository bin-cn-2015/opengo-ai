import type { ModelInfo } from "./types";

export type OnnxMetadata = Readonly<Record<string, string>>;

export interface KataGoOnnxMetadata {
  metadataVersion: number;
  name: string;
  modelVersion: number;
  numInputChannels: number;
  numInputGlobalChannels: number;
  numInputMetaChannels: number;
  numPolicyChannels: number;
  numValueChannels: number;
  numScoreValueChannels: number;
  numOwnershipChannels: number;
  metaEncoderVersion: number;
  nnXLen: number;
  nnYLen: number;
  requireExactNNLen: boolean;
  hasTransformerBlocks?: boolean;
  hasNestedBottleneckBlocks?: boolean;
  sourceSha256?: string;
}

const REQUIRED_NUMBERS = [
  "katago.metadataVersion",
  "katago.modelVersion",
  "katago.numInputChannels",
  "katago.numInputGlobalChannels",
  "katago.numInputMetaChannels",
  "katago.numPolicyChannels",
  "katago.numValueChannels",
  "katago.numScoreValueChannels",
  "katago.numOwnershipChannels",
  "katago.build.nnXLen",
  "katago.build.nnYLen",
] as const;

const KNOWN_KATAGO_KEYS = new Set([
  ...REQUIRED_NUMBERS,
  "katago.name",
  "katago.build.requireExactNNLen",
  "katago.metaEncoderVersion",
  "katago.preferPassAliveUnderSuicideRules",
  "katago.preferExcludeTerritoryAdjacentToAtari",
  "katago.postProcess.tdScoreMultiplier",
  "katago.postProcess.scoreMeanMultiplier",
  "katago.postProcess.scoreStdevMultiplier",
  "katago.postProcess.leadMultiplier",
  "katago.postProcess.varianceTimeMultiplier",
  "katago.postProcess.shorttermValueErrorMultiplier",
  "katago.postProcess.shorttermScoreErrorMultiplier",
  "katago.postProcess.outputScaleMultiplier",
  "katago.fp32Nodes.trunkTipAndHead",
  "katago.fp32Nodes.rmsNorm",
  "katago.build.scale8Applied",
  "katago.build.transformerNHWC",
  "katago.info.arch.trunkSpatialConvDepth",
  "katago.info.arch.numParameters",
  "katago.info.arch.hasAnyTransformerBlocks",
  "katago.info.arch.hasAnyNestedBottleneckBlocks",
  "katago.info.sourceSha256",
]);

export class ModelMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelMetadataError";
  }
}

function required(metadata: OnnxMetadata, key: string): string {
  const value = metadata[key];
  if (value === undefined || value.length === 0) {
    throw new ModelMetadataError(`Missing required ONNX metadata key: ${key}`);
  }
  return value;
}

function integer(metadata: OnnxMetadata, key: string): number {
  const raw = required(metadata, key);
  if (!/^\d+$/.test(raw)) {
    throw new ModelMetadataError(`Metadata ${key} must be a non-negative integer; got "${raw}".`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new ModelMetadataError(`Metadata ${key} is outside the safe integer range.`);
  }
  return value;
}

function positiveInteger(metadata: OnnxMetadata, key: string): number {
  const value = integer(metadata, key);
  if (value <= 0) throw new ModelMetadataError(`Metadata ${key} must be greater than zero.`);
  return value;
}

function booleanValue(metadata: OnnxMetadata, key: string, fallback: boolean): boolean {
  const raw = metadata[key];
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ModelMetadataError(`Metadata ${key} must be "true" or "false"; got "${raw}".`);
}

/**
 * Parse the official KataGo ONNX metadata contract (metadataVersion=1).
 * Unknown katago.* keys are rejected because that namespace is must-understand.
 */
export function parseKataGoOnnxMetadata(metadata: OnnxMetadata): KataGoOnnxMetadata {
  for (const key of Object.keys(metadata)) {
    if (key.startsWith("katago.") && !key.startsWith("katago.info.") && !KNOWN_KATAGO_KEYS.has(key)) {
      throw new ModelMetadataError(`Unsupported must-understand KataGo metadata key: ${key}`);
    }
  }

  const metadataVersion = positiveInteger(metadata, "katago.metadataVersion");
  if (metadataVersion !== 1) {
    throw new ModelMetadataError(`Unsupported KataGo ONNX metadata contract version ${metadataVersion}; supported: 1.`);
  }

  const name = required(metadata, "katago.name");
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(name)) {
    throw new ModelMetadataError("Metadata katago.name must be 1-96 characters from [A-Za-z0-9_-].");
  }

  const modelVersion = positiveInteger(metadata, "katago.modelVersion");
  if (modelVersion < 3 || modelVersion > 17) {
    throw new ModelMetadataError(`Unsupported KataGo model version ${modelVersion}; this runtime currently targets versions 3-17.`);
  }

  const numInputChannels = positiveInteger(metadata, "katago.numInputChannels");
  const numInputGlobalChannels = positiveInteger(metadata, "katago.numInputGlobalChannels");
  const numInputMetaChannels = integer(metadata, "katago.numInputMetaChannels");
  const numPolicyChannels = positiveInteger(metadata, "katago.numPolicyChannels");
  const numValueChannels = positiveInteger(metadata, "katago.numValueChannels");
  const numScoreValueChannels = positiveInteger(metadata, "katago.numScoreValueChannels");
  const numOwnershipChannels = positiveInteger(metadata, "katago.numOwnershipChannels");
  const nnXLen = positiveInteger(metadata, "katago.build.nnXLen");
  const nnYLen = positiveInteger(metadata, "katago.build.nnYLen");

  if (numInputMetaChannels < 0) {
    throw new ModelMetadataError("Metadata katago.numInputMetaChannels cannot be negative.");
  }

  const metaEncoderVersion = modelVersion >= 15
    ? positiveOrZero(metadata, "katago.metaEncoderVersion")
    : positiveOrZero(metadata, "katago.metaEncoderVersion", 0);
  if ((metaEncoderVersion > 0) !== (numInputMetaChannels > 0)) {
    throw new ModelMetadataError("katago.metaEncoderVersion and katago.numInputMetaChannels disagree about the InputMeta tensor.");
  }
  required(metadata, "katago.build.requireExactNNLen");

  if (modelVersion >= 15) {
    booleanValue(metadata, "katago.preferPassAliveUnderSuicideRules", false);
    booleanValue(metadata, "katago.preferExcludeTerritoryAdjacentToAtari", false);
  }
  if (modelVersion >= 13) {
    for (const key of [
      "katago.postProcess.tdScoreMultiplier",
      "katago.postProcess.scoreMeanMultiplier",
      "katago.postProcess.scoreStdevMultiplier",
      "katago.postProcess.leadMultiplier",
      "katago.postProcess.varianceTimeMultiplier",
      "katago.postProcess.shorttermValueErrorMultiplier",
      "katago.postProcess.shorttermScoreErrorMultiplier",
    ]) {
      const value = Number(required(metadata, key));
      if (!Number.isFinite(value)) throw new ModelMetadataError(`Metadata ${key} must be a finite number.`);
    }
  }

  return {
    metadataVersion,
    name,
    modelVersion,
    numInputChannels,
    numInputGlobalChannels,
    numInputMetaChannels,
    numPolicyChannels,
    numValueChannels,
    numScoreValueChannels,
    numOwnershipChannels,
    metaEncoderVersion,
    nnXLen,
    nnYLen,
    requireExactNNLen: booleanValue(metadata, "katago.build.requireExactNNLen", false),
    hasTransformerBlocks: metadata["katago.info.arch.hasAnyTransformerBlocks"] === undefined
      ? undefined
      : booleanValue(metadata, "katago.info.arch.hasAnyTransformerBlocks", false),
    hasNestedBottleneckBlocks: metadata["katago.info.arch.hasAnyNestedBottleneckBlocks"] === undefined
      ? undefined
      : booleanValue(metadata, "katago.info.arch.hasAnyNestedBottleneckBlocks", false),
    sourceSha256: metadata["katago.info.sourceSha256"],
  };
}

function positiveOrZero(metadata: OnnxMetadata, key: string, fallback?: number): number {
  if (metadata[key] === undefined && fallback !== undefined) return fallback;
  return integer(metadata, key);
}

export function assertTargetTransformerV17(metadata: KataGoOnnxMetadata): void {
  if (metadata.modelVersion !== 17) {
    throw new ModelMetadataError(`The current Transformer acceptance target requires modelVersion 17; got ${metadata.modelVersion}.`);
  }
  if (metadata.hasTransformerBlocks === false || metadata.hasNestedBottleneckBlocks === false || !metadata.name.includes("tf3-b11c768")) {
    throw new ModelMetadataError(
      "The selected model does not identify itself as the tf3-b11c768 nested-bottleneck Transformer. Refusing to treat a legacy convnet as the v17 target.",
    );
  }
}

export function toModelInfo(metadata: KataGoOnnxMetadata): ModelInfo {
  return {
    modelVersion: metadata.modelVersion,
    architecture: metadata.hasNestedBottleneckBlocks ? "nested-bottleneck-transformer" :
      metadata.hasTransformerBlocks ? "transformer" : "convolutional",
    supportedBoardSizes: metadata.requireExactNNLen
      ? [metadata.nnXLen, metadata.nnYLen].filter((size, index, values) => values.indexOf(size) === index)
      : undefined,
    name: metadata.name,
  };
}
