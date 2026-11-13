import { describe, expect, it } from "vitest";
import {
  assertTargetTransformerV17,
  ModelMetadataError,
  parseKataGoOnnxMetadata,
} from "./model-metadata";
import { validateKataGoGraphNames } from "./model-contract";

const baseMetadata: Record<string, string> = {
  "katago.metadataVersion": "1",
  "katago.name": "kata1-tf3-b11c768-s12382M-d6533M",
  "katago.modelVersion": "17",
  "katago.numInputChannels": "22",
  "katago.numInputGlobalChannels": "19",
  "katago.numInputMetaChannels": "0",
  "katago.numPolicyChannels": "4",
  "katago.numValueChannels": "3",
  "katago.numScoreValueChannels": "6",
  "katago.numOwnershipChannels": "1",
  "katago.metaEncoderVersion": "0",
  "katago.preferPassAliveUnderSuicideRules": "false",
  "katago.preferExcludeTerritoryAdjacentToAtari": "false",
  "katago.postProcess.tdScoreMultiplier": "20",
  "katago.postProcess.scoreMeanMultiplier": "20",
  "katago.postProcess.scoreStdevMultiplier": "20",
  "katago.postProcess.leadMultiplier": "20",
  "katago.postProcess.varianceTimeMultiplier": "40",
  "katago.postProcess.shorttermValueErrorMultiplier": "0.25",
  "katago.postProcess.shorttermScoreErrorMultiplier": "30",
  "katago.build.nnXLen": "19",
  "katago.build.nnYLen": "19",
  "katago.build.requireExactNNLen": "false",
  "katago.info.arch.hasAnyTransformerBlocks": "true",
  "katago.info.arch.hasAnyNestedBottleneckBlocks": "true",
};

describe("parseKataGoOnnxMetadata", () => {
  it("parses the v17 nested Transformer metadata", () => {
    const parsed = parseKataGoOnnxMetadata(baseMetadata);
    expect(parsed.modelVersion).toBe(17);
    expect(parsed.name).toContain("tf3-b11c768");
    expect(parsed.hasTransformerBlocks).toBe(true);
    expect(parsed.preferPassAliveUnderSuicideRules).toBe(false);
    expect(parsed.preferExcludeTerritoryAdjacentToAtari).toBe(false);
    expect(() => assertTargetTransformerV17(parsed)).not.toThrow();
  });

  it("rejects a missing semantic metadata key", () => {
    const metadata = { ...baseMetadata };
    delete metadata["katago.preferPassAliveUnderSuicideRules"];
    expect(() => parseKataGoOnnxMetadata(metadata)).toThrow(ModelMetadataError);
  });

  it("rejects unknown must-understand keys", () => {
    expect(() => parseKataGoOnnxMetadata({
      ...baseMetadata,
      "katago.futureSemanticFlag": "true",
    })).toThrow(/Unsupported must-understand/);
  });

  it("rejects a non-transformer model for the v17 acceptance target", () => {
    const parsed = parseKataGoOnnxMetadata({
      ...baseMetadata,
      "katago.info.arch.hasAnyNestedBottleneckBlocks": "false",
    });
    expect(() => assertTargetTransformerV17(parsed)).toThrow(/does not identify/);
  });

  it("requires the exact-board-buffer metadata and consistent meta encoder channels", () => {
    const withoutExact = { ...baseMetadata };
    delete withoutExact["katago.build.requireExactNNLen"];
    expect(() => parseKataGoOnnxMetadata(withoutExact)).toThrow(/katago.build.requireExactNNLen/);

    expect(() => parseKataGoOnnxMetadata({
      ...baseMetadata,
      "katago.metaEncoderVersion": "1",
      "katago.numInputMetaChannels": "0",
    })).toThrow(/disagree about the InputMeta tensor/);
  });

  it("requires the v17 target model family name", () => {
    const parsed = parseKataGoOnnxMetadata({
      ...baseMetadata,
      "katago.name": "some-other-model",
    });
    expect(() => assertTargetTransformerV17(parsed)).toThrow(/tf3-b11c768/);
  });

  it("rejects malformed booleans and unsupported contract versions", () => {
    expect(() => parseKataGoOnnxMetadata({
      ...baseMetadata,
      "katago.build.requireExactNNLen": "yes",
    })).toThrow(/must be "true" or "false"/);
    expect(() => parseKataGoOnnxMetadata({
      ...baseMetadata,
      "katago.metadataVersion": "2",
    })).toThrow(/Unsupported KataGo ONNX metadata contract/);
  });
});

describe("validateKataGoGraphNames", () => {
  it("checks KataGo input and output tensor names", () => {
    const parsed = parseKataGoOnnxMetadata(baseMetadata);
    expect(() => validateKataGoGraphNames(parsed, {
      inputNames: ["InputSpatial", "InputGlobal", "InputMask"],
      outputNames: [
        "OutputPolicyPass",
        "OutputPolicy",
        "OutputValue",
        "OutputScoreValue",
        "OutputOwnership",
      ],
    })).not.toThrow();
  });

  it("rejects input ordering that violates the KataGo binding contract", () => {
    const parsed = parseKataGoOnnxMetadata(baseMetadata);
    expect(() => validateKataGoGraphNames(parsed, {
      inputNames: ["InputSpatial", "InputMask", "InputGlobal"],
      outputNames: ["OutputPolicyPass", "OutputPolicy", "OutputValue", "OutputScoreValue", "OutputOwnership"],
    })).toThrow(/must be ordered/);
  });

  it("requires InputMeta only for metadata-encoder models", () => {
    const metadata = parseKataGoOnnxMetadata({
      ...baseMetadata,
      "katago.metaEncoderVersion": "1",
      "katago.numInputMetaChannels": "4",
    });
    expect(() => validateKataGoGraphNames(metadata, {
      inputNames: ["InputSpatial", "InputGlobal", "InputMask"],
      outputNames: [
        "OutputPolicyPass", "OutputPolicy", "OutputValue",
        "OutputScoreValue", "OutputOwnership",
      ],
    })).toThrow(/InputMeta/);
  });
});
