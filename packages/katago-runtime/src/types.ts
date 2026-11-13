/** Browser execution targets supported by the OpenGo KataGo runtime. */
export type InferenceBackend = "wasm" | "webgl" | "webgpu";
export type BackendPreference = "auto" | InferenceBackend;

export interface BackendCapabilities {
  wasm: boolean;
  webgl: boolean;
  webgpu: boolean;
}

export interface ModelInfo {
  /** KataGo model format version read from the model/export metadata. */
  modelVersion: number;
  /** Neural-network architecture identifier, e.g. tf3-b11c768. */
  architecture: string;
  /** Input board dimensions supported by this exported graph. */
  supportedBoardSizes?: readonly number[];
  /** Source model/export identifier, when available. */
  name?: string;
}

export interface AnalyzeRequest {
  /** Board width and height. KataGo supports square boards. */
  boardSize: number;
  /** Current player, using KataGo's player encoding. */
  nextPlayer: "B" | "W";
  /** Board cells in row-major order: 0 empty, 1 black, 2 white. */
  board: Uint8Array;
  /** Optional move history, oldest first, in board coordinates. */
  moves?: readonly { player: "B" | "W"; x: number; y: number }[];
}

export interface CandidateMove {
  move: { x: number; y: number } | "pass";
  /** Probability-like policy prior, normalized across legal moves. */
  prior: number;
  /** Estimated win probability for the requested perspective. */
  winrate: number;
  /** Estimated score lead in points for the requested perspective. */
  scoreLead: number;
  /** Principal variation, including this candidate move. */
  variation: readonly ({ x: number; y: number } | "pass")[];
}

export interface AnalysisUpdate {
  /** Monotonically increasing update number for one analysis request. */
  sequence: number;
  /** Search visits completed so far. */
  visits: number;
  /** Best current candidates, ordered by search preference. */
  candidates: readonly CandidateMove[];
  /** Whether the search has completed. */
  done: boolean;
}

export interface RuntimeOptions {
  backend: BackendPreference;
  /** URL, ArrayBuffer, or Uint8Array containing an ONNX export. */
  model: string | ArrayBuffer | Uint8Array;
  boardSize?: number;
}

export interface KataGoRuntime {
  load(): Promise<ModelInfo>;
  analyze(request: AnalyzeRequest): AsyncIterable<AnalysisUpdate>;
  dispose(): Promise<void>;
}
