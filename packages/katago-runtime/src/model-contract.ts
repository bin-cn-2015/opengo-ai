import type { KataGoOnnxMetadata } from "./model-metadata";
import { ModelMetadataError } from "./model-metadata";

export interface OnnxGraphNames {
  inputNames: readonly string[];
  outputNames: readonly string[];
}

const REQUIRED_OUTPUTS = [
  "OutputPolicyPass",
  "OutputPolicy",
  "OutputValue",
  "OutputScoreValue",
  "OutputOwnership",
] as const;

/**
 * Validate the named tensor boundary described by KataGo's ONNX file contract.
 * Shape/dtype checks are performed by the graph-inspection tooling and runtime
 * smoke tests; this function prevents accidental name/order mismatches.
 */
export function validateKataGoGraphNames(
  metadata: KataGoOnnxMetadata,
  graph: OnnxGraphNames,
): void {
  const expectedInputs = [
    "InputSpatial",
    "InputGlobal",
    ...(metadata.metaEncoderVersion > 0 ? ["InputMeta"] : []),
    "InputMask",
  ];

  assertExactNames("input", expectedInputs, graph.inputNames);\n  if (expectedInputs.some((name, index) => graph.inputNames[index] !== name)) {\n    throw new ModelMetadataError("KataGo ONNX graph inputs must be ordered InputSpatial, InputGlobal, InputMeta (when present), InputMask.");\n  }
  assertExactNames("output", REQUIRED_OUTPUTS, graph.outputNames);
}

function assertExactNames(
  kind: "input" | "output",
  expected: readonly string[],
  actual: readonly string[],
): void {
  const missing = expected.filter(name => !actual.includes(name));
  const unexpected = actual.filter(name => !expected.includes(name));
  if (missing.length > 0 || unexpected.length > 0) {
    const details = [
      missing.length ? `missing: ${missing.join(", ")}` : "",
      unexpected.length ? `unexpected: ${unexpected.join(", ")}` : "",
    ].filter(Boolean).join("; ");
    throw new ModelMetadataError(`Invalid KataGo ONNX graph ${kind} names (${details}).`);
  }
}
