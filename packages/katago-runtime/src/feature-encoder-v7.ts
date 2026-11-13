import type { KataGoOnnxMetadata } from "./model-metadata";

export type V7Color = "B" | "W";
export type V7Stone = 0 | 1 | 2;
export type V7ScoringRule = "area" | "territory";
export type V7TaxRule = "none" | "seki" | "all";
export type V7KoRule = "simple" | "positional" | "situational";

export interface V7Move {
  player: V7Color;
  /** Zero-based board coordinate. null denotes pass. */
  x: number | null;
  y: number | null;
}

export interface V7Rules {
  koRule: V7KoRule;
  scoringRule: V7ScoringRule;
  taxRule: V7TaxRule;
  multiStoneSuicideLegal: boolean;
}

export interface V7LadderMasks {
  /** Stones that KataGo's iterLadders marks on the current board. */
  current: Uint8Array;
  /** Same mask computed on the board one valid turn ago. */
  previous: Uint8Array;
  /** Same mask computed on the board two valid turns ago. */
  previousPrevious: Uint8Array;
  /** Ladder escape points returned by iterLadders for opponent chains in >1 liberty. */
  opponentEscape: Uint8Array;
}

export interface KataGoV7Position {
  width: number;
  height: number;
  /** Row-major: 0 empty, 1 black, 2 white. */
  board: Uint8Array;
  nextPlayer: V7Color;
  /** Full game move history, oldest first. Pass is x=null,y=null. */
  moves: readonly V7Move[];
  /** Number of recent moves valid in this phase; caps history features. */
  validTurnsThisPhase: number;
  /** Current board followed by the prior two boards, each row-major. */
  recentBoards: readonly [Uint8Array, Uint8Array, Uint8Array];
  /** In normal play this includes simple-ko and superko-banned locations. */
  superKoBanned: Uint8Array;
  /** Used only during encore phases. */
  koRecapBlocked: Uint8Array;
  encorePhase: number;
  rules: V7Rules;
  /** Komi signed from nextPlayer's perspective. If omitted, derived from white-positive komi. */
  komi: number;
  /** True if a pass would end the current phase under the active rules/history. */
  passWouldEndPhase: boolean;
  /** True when KataGo's pass handling requires move history to be hidden. */
  suppressHistory?: boolean;
  /** Game finished or past normal phase end: KataGo retains at most one move. */
  gameFinishedOrPastPhaseEnd?: boolean;
  maxHistory?: number;
  /** Area ownership from nextPlayer's perspective: 0 neutral, 1 self, 2 opponent. */
  areaOwners?: Uint8Array;
  /** Absolute colors at the beginning of the second encore: 0 empty, 1 black, 2 white. */
  secondEncoreStartColors?: Uint8Array;
  ladderMasks: V7LadderMasks;
  hasButton?: boolean;
  /** KataGo playoutDoublingAdvantage query parameter. */
  playoutDoublingAdvantage?: number;
  /** Absolute white-positive komi. Required unless selfKomi is provided. */
  whiteKomi?: number;
  /** Current komi from the next player's perspective, including any draw-equivalent adjustment. */
  selfKomi?: number;
  /** Human-style SGF metadata features, required only if the model has InputMeta. */
  meta?: Float32Array;
}

export interface EncodedKataGoV7Inputs {
  spatial: Float32Array;
  global: Float32Array;
  mask: Float32Array;
  meta?: Float32Array;
}

const SPATIAL_CHANNELS_V7 = 22;
const GLOBAL_CHANNELS_V7 = 19;
const KOMI_CLIP_RADIUS = 20;

function assertBinaryMask(name: string, mask: Uint8Array, length: number): void {
  if (mask.length !== length) {
    throw new RangeError(\`\${name} must contain \${length} board entries; got \${mask.length}.\`);
  }
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] !== 0 && mask[i] !== 1) {
      throw new RangeError(\`\${name} must contain only 0 or 1; invalid value at index \${i}.\`);
    }
  }
}

function assertBoard(name: string, board: Uint8Array, length: number): void {
  if (board.length !== length) throw new RangeError(\`\${name} must contain \${length} board entries.\`);
  for (let i = 0; i < board.length; i += 1) {
    if (board[i] !== 0 && board[i] !== 1 && board[i] !== 2) {
      throw new RangeError(\`\${name} contains an invalid stone value at index \${i}.\`);
    }
  }
}

function libertiesByPoint(board: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(board.length);
  const visited = new Uint8Array(board.length);
  const queue = new Int32Array(board.length);
  const liberties = new Uint8Array(board.length);

  for (let start = 0; start < board.length; start += 1) {
    const color = board[start];
    if (color === 0 || visited[start] === 1) continue;

    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let libertyCount = 0;
    const libertySeen = new Uint8Array(board.length);

    while (head < tail) {
      const point = queue[head++];
      const x = point % width;
      const y = Math.floor(point / width);
      const neighbors = [
        y > 0 ? point - width : -1,
        y + 1 < height ? point + width : -1,
        x > 0 ? point - 1 : -1,
        x + 1 < width ? point + 1 : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0) continue;
        if (board[neighbor] === 0) {
          if (libertySeen[neighbor] === 0) {
            libertySeen[neighbor] = 1;
            libertyCount += 1;
          }
        } else if (board[neighbor] === color && visited[neighbor] === 0) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }

    const encoded = libertyCount === 1 ? 1 : libertyCount === 2 ? 2 : libertyCount === 3 ? 3 : 0;
    for (let i = 0; i < tail; i += 1) result[queue[i]] = encoded;
  }
  return result;
}

function currentSelfKomi(position: KataGoV7Position): number {
  if (position.selfKomi !== undefined) return position.selfKomi;
  if (position.whiteKomi === undefined) {
    throw new Error("V7 encoding requires selfKomi or whiteKomi.");
  }
  return position.nextPlayer === "W" ? position.whiteKomi : -position.whiteKomi;
}

function hasAreaFeatures(position: KataGoV7Position): boolean {
  // Matches KataGo fillRowV7: territory scoring only exposes area features
  // in encore phase 2 or later; area scoring always exposes them.
  return position.rules.scoringRule === "area" || position.encorePhase >= 2;
}

/**
 * Encode KataGo input version 7 (model versions 16+), matching
 * cpp/neuralnet/nninputs.cpp::NNInputs::fillRowV7 channel layout.
 *
 * Expensive rule-derived data (pass-alive/independent-life area and ladder
 * searches) is deliberately injected as explicit masks. This encoder does
 * not approximate those algorithms or silently substitute empty features.
 */
export function encodeKataGoV7(
  position: KataGoV7Position,
  metadata: KataGoOnnxMetadata,
): EncodedKataGoV7Inputs {
  if (metadata.modelVersion < 16) {
    throw new Error(\`KataGo V7 input encoding requires modelVersion >= 16; got \${metadata.modelVersion}.\`);
  }
  if (metadata.numInputChannels !== SPATIAL_CHANNELS_V7 ||
      metadata.numInputGlobalChannels !== GLOBAL_CHANNELS_V7) {
    throw new Error(
      \`Model metadata is not a V7 22/19 input model (got \${metadata.numInputChannels}/\${metadata.numInputGlobalChannels}).\`,
    );
  }

  const { width, height } = position;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new RangeError("Board width and height must be integers >= 2.");
  }
  if (width > metadata.nnXLen || height > metadata.nnYLen) {
    throw new RangeError("Board dimensions exceed the ONNX model's fixed input buffer.");
  }
  if (metadata.requireExactNNLen && (width !== metadata.nnXLen || height !== metadata.nnYLen)) {
    throw new RangeError("This ONNX graph requires the board to exactly fill its input buffer.");
  }

  const boardArea = width * height;
  const bufferArea = metadata.nnXLen * metadata.nnYLen;
  assertBoard("board", position.board, boardArea);
  for (const [index, snapshot] of position.recentBoards.entries()) {
    assertBoard(\`recentBoards[\${index}]\`, snapshot, boardArea);
  }
  assertBinaryMask("superKoBanned", position.superKoBanned, boardArea);
  assertBinaryMask("koRecapBlocked", position.koRecapBlocked, boardArea);
  assertBinaryMask("ladderMasks.current", position.ladderMasks.current, boardArea);
  assertBinaryMask("ladderMasks.previous", position.ladderMasks.previous, boardArea);
  assertBinaryMask("ladderMasks.previousPrevious", position.ladderMasks.previousPrevious, boardArea);
  assertBinaryMask("ladderMasks.opponentEscape", position.ladderMasks.opponentEscape, boardArea);

  if (!Number.isInteger(position.encorePhase) || position.encorePhase < 0 || position.encorePhase > 2) {
    throw new RangeError("encorePhase must be 0, 1, or 2.");
  }
  if (!Number.isInteger(position.validTurnsThisPhase) || position.validTurnsThisPhase < 0) {
    throw new RangeError("validTurnsThisPhase must be a non-negative integer.");
  }
  if (position.moves.length < position.validTurnsThisPhase) {
    throw new RangeError("moves does not contain validTurnsThisPhase entries.");
  }

  const areaEnabled = hasAreaFeatures(position);
  if (areaEnabled) {
    if (!position.areaOwners) {
      throw new Error("KataGo V7 requires pass-alive/independent-life area ownership for the active scoring rules.");
    }
    if (position.areaOwners.length !== boardArea ||
        position.areaOwners.some(value => value !== 0 && value !== 1 && value !== 2)) {
      throw new RangeError("areaOwners must be a board-sized array with values 0, 1, or 2 from nextPlayer's perspective.");
    }
  }
  if (position.encorePhase >= 2 && !position.secondEncoreStartColors) {
    throw new Error("KataGo V7 requires secondEncoreStartColors during encore phase 2.");
  }
  if (position.secondEncoreStartColors) {
    assertBoard("secondEncoreStartColors", position.secondEncoreStartColors, boardArea);
  }

  const spatial = new Float32Array(SPATIAL_CHANNELS_V7 * bufferArea);
  const global = new Float32Array(GLOBAL_CHANNELS_V7);
  const mask = new Float32Array(bufferArea);
  const own = position.nextPlayer === "B" ? 1 : 2;
  const opponent = own === 1 ? 2 : 1;
  const liberties = libertiesByPoint(position.board, width, height);

  const set = (channel: number, point: number): void => {
    const y = Math.floor(point / width);
    const x = point % width;
    spatial[channel * bufferArea + y * metadata.nnXLen + x] = 1;
  };

  // Features 0-5: board mask, player-relative stones and 1/2/3 liberties.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = y * width + x;
      const bufferPoint = y * metadata.nnXLen + x;
      const stone = position.board[point];
      spatial[bufferPoint] = 1;
      mask[bufferPoint] = 1;
      if (stone === own) set(1, point);
      else if (stone === opponent) set(2, point);
      if (stone !== 0) {
        if (liberties[point] === 1) set(3, point);
        else if (liberties[point] === 2) set(4, point);
        else if (liberties[point] === 3) set(5, point);
      }
    }
  }

  // Feature 6: normal ko/superko bans, or encore superko bans.
  // Feature 7: encore ko-recapture blocks. Feature 8 is reserved and remains 0.
  for (let point = 0; point < boardArea; point += 1) {
    if (position.encorePhase === 0) {
      if (position.superKoBanned[point] === 1) set(6, point);
    } else {
      if (position.superKoBanned[point] === 1) set(6, point);
      if (position.koRecapBlocked[point] === 1) set(7, point);
    }
  }

  // Area features 18/19 are relative to the player to move.
  if (areaEnabled) {
    for (let point = 0; point < boardArea; point += 1) {
      if (position.areaOwners![point] === 1) set(18, point);
      else if (position.areaOwners![point] === 2) set(19, point);
      else if (position.rules.scoringRule === "territory" && position.encorePhase >= 2) {
        const startingStone = position.secondEncoreStartColors?.[point] ?? 0;
        if (position.board[point] === own && startingStone === own) set(18, point);
        else if (position.board[point] === opponent && startingStone === opponent) set(19, point);
      }
    }
  }

  // Match KataGo's history visibility and phase cap.
  let maxHistory = position.suppressHistory ? 0 : 5;
  if (!position.suppressHistory && position.gameFinishedOrPastPhaseEnd) maxHistory = 1;
  maxHistory = Math.min(maxHistory, position.maxHistory ?? 5, position.validTurnsThisPhase);
  const recentMoves = position.moves.slice(-maxHistory).reverse();
  const expectedPreviousPlayer: V7Color = position.nextPlayer === "B" ? "W" : "B";
  const passGlobalIndex = [0, 1, 2, 3, 4];
  const spatialHistoryChannel = [9, 10, 11, 12, 13];
  let includedMoves = 0;
  let expectedPlayer = expectedPreviousPlayer;

  for (let i = 0; i < recentMoves.length; i += 1) {
    const move = recentMoves[i];
    if (move.player !== expectedPlayer) break;
    includedMoves += 1;
    if (move.x === null && move.y === null) {
      global[passGlobalIndex[i]] = 1;
    } else {
      if (move.x === null || move.y === null ||
          !Number.isInteger(move.x) || !Number.isInteger(move.y) ||
          move.x < 0 || move.y < 0 || move.x >= width || move.y >= height) {
        throw new RangeError(\`Invalid historical move at reverse index \${i}.\`);
      }
      set(spatialHistoryChannel[i], move.y * width + move.x);
    }
    expectedPlayer = expectedPlayer === "B" ? "W" : "B";
  }

  // Features 14-17: expensive ladder search outputs computed on current and
  // previous boards by the rules/search layer, not guessed by this encoder.
  for (let point = 0; point < boardArea; point += 1) {
    if (position.ladderMasks.current[point] === 1) set(14, point);
    const prevMask = includedMoves < 1
      ? position.ladderMasks.current
      : position.ladderMasks.previous;
    const prevPrevMask = includedMoves < 2
      ? prevMask
      : position.ladderMasks.previousPrevious;
    if (prevMask[point] === 1) set(15, point);
    if (prevPrevMask[point] === 1) set(16, point);
    if (position.board[point] === opponent && liberties[point] > 1 &&
        position.ladderMasks.opponentEscape[point] === 1) set(17, point);
  }

  // Global features 5-18.
  let selfKomi = currentSelfKomi(position);
  if (!Number.isFinite(selfKomi)) throw new RangeError("selfKomi must be finite.");
  selfKomi = Math.max(-boardArea - KOMI_CLIP_RADIUS, Math.min(boardArea + KOMI_CLIP_RADIUS, selfKomi));
  global[5] = selfKomi / 20;

  if (position.rules.koRule !== "simple") {
    global[6] = 1;
    global[7] = position.rules.koRule === "situational" ? -0.5 : 0.5;
  }
  if (position.rules.multiStoneSuicideLegal) global[8] = 1;
  if (position.rules.scoringRule === "territory") global[9] = 1;
  if (position.rules.taxRule === "seki" || position.rules.taxRule === "all") global[10] = 1;
  if (position.rules.taxRule === "all") global[11] = 1;
  if (position.encorePhase > 0) global[12] = 1;
  if (position.encorePhase > 1) global[13] = 1;
  global[14] = position.passWouldEndPhase ? 1 : 0;

  const advantage = position.playoutDoublingAdvantage ?? 0;
  if (!Number.isFinite(advantage)) throw new RangeError("playoutDoublingAdvantage must be finite.");
  if (advantage !== 0) {
    global[15] = 1;
    global[16] = 0.5 * advantage;
  }
  if (position.hasButton) global[17] = 1;

  if (position.rules.scoringRule === "area" || position.encorePhase >= 2) {
    const evenBoardArea = boardArea % 2 === 0;
    const komiFloor = evenBoardArea
      ? Math.floor(selfKomi / 2) * 2
      : Math.floor((selfKomi - 1) / 2) * 2 + 1;
    const delta = Math.max(0, Math.min(2, selfKomi - komiFloor));
    global[18] = delta < 0.5 ? delta : delta < 1.5 ? 1 - delta : delta - 2;
  }

  if (metadata.metaEncoderVersion > 0) {
    if (!position.meta) throw new Error("This model requires SGF metadata features in InputMeta.");
    if (position.meta.length !== metadata.numInputMetaChannels) {
      throw new RangeError(\`InputMeta must contain \${metadata.numInputMetaChannels} values.\`);
    }
  } else if (position.meta) {
    throw new Error("InputMeta was supplied for a model that does not have a metadata encoder.");
  }

  return {
    spatial,
    global,
    mask,
    meta: position.meta ? new Float32Array(position.meta) : undefined,
  };
}
