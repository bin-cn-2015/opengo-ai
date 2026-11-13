export {
  BackendUnavailableError,
  isBackendPreference,
  resolveBackend,
} from "./backend";
export {
  assertTargetTransformerV17,
  ModelMetadataError,
  parseKataGoOnnxMetadata,
  toModelInfo,
} from "./model-metadata";
export { validateKataGoGraphNames } from "./model-contract";
export { createKataGoOnnxSession } from "./onnx-session";
export type {
  KataGoOnnxSession,
  KataGoRawOutputs,
  KataGoTensorInput,
  KataGoTensorOutput,
  OnnxSessionOptions,
} from "./onnx-session";
export type { KataGoOnnxMetadata, OnnxMetadata } from "./model-metadata";
export type { OnnxGraphNames } from "./model-contract";
export type {
  AnalysisUpdate,
  AnalyzeRequest,
  BackendCapabilities,
  BackendPreference,
  CandidateMove,
  InferenceBackend,
  KataGoRuntime,
  ModelInfo,
  RuntimeOptions,
} from "./types";

export { encodeKataGoV7 } from "./feature-encoder-v7";
export type {
  EncodedKataGoV7Inputs,
  KataGoV7Position,
  V7Color,
  V7KoRule,
  V7LadderMasks,
  V7Move,
  V7Rules,
  V7ScoringRule,
  V7Stone,
  V7TaxRule,
} from "./feature-encoder-v7";

export { deriveV7RuleFeatures, encodeKataGoV7WithDerivedRules } from "./v7-rule-features";
export type { V7DerivedRuleFeatures, V7RuleFeatureOptions } from "./v7-rule-features";
