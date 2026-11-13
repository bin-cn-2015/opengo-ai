import {
  findLadderedStones,
  findLadderEscapePoints,
  calculatePassAliveArea,
  type Board,
  type Stone,
} from "../../go-engine/src";
import { encodeKataGoV7, type EncodedKataGoV7Inputs, type KataGoV7Position, type V7LadderMasks } from "./feature-encoder-v7";
import type { KataGoOnnxMetadata } from "./model-metadata";

export interface V7RuleFeatureOptions {
  /** Optional precomputed escape-point plane; otherwise derived by the TS ladder reader. */
  opponentEscape?: Uint8Array;
  maxLadderNodes?: number;
  maxLadderDepth?: number;
}

export interface V7DerivedRuleFeatures {
  ladderMasks: V7LadderMasks;
  /** 0 neutral, 1 next player, 2 opponent. */
  areaOwners: Uint8Array;
}

function decodeBoard(flat: Uint8Array, width: number, height: number): Board {
  if (flat.length !== width * height) {
    throw new RangeError("Board snapshot has the wrong number of points.");
  }
  const board: Board = [];
  for (let y = 0; y < height; y += 1) {
    const row: (Stone | null)[] = [];
    for (let x = 0; x < width; x += 1) {
      const value = flat[y * width + x];
      if (value === 0) row.push(null);
      else if (value === 1) row.push("black");
      else if (value === 2) row.push("white");
      else throw new RangeError("Invalid stone value in board snapshot.");
    }
    board.push(row);
  }
  return board;
}

function encodeAreaOwners(board: Board, nextPlayer: Stone): Uint8Array {
  const area = calculatePassAliveArea(board);
  const result = new Uint8Array(board.length * board.length);
  const opponent: Stone = nextPlayer === "black" ? "white" : "black";
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board.length; x += 1) {
      const owner = area.owners[y][x];
      if (owner === nextPlayer) result[y * board.length + x] = 1;
      else if (owner === opponent) result[y * board.length + x] = 2;
    }
  }
  return result;
}

/**
 * Derive current and two historical ladder planes plus current pass-alive
 * area. recentBoards must be [current, one-ply-old, two-ply-old].
 *
 * The opponentEscape plane is computed by the TypeScript ladder reader using
 * KataGo iterLadders semantics: for each opponent chain with two liberties,
 * test each attacking liberty and retain those that lead to a proven
 * defender-first ladder capture. Callers may supply a precomputed plane.
 */
export function deriveV7RuleFeatures(
  position: Pick<KataGoV7Position, "width" | "height" | "board" | "nextPlayer" | "recentBoards">,
  options: V7RuleFeatureOptions,
): V7DerivedRuleFeatures {
  const { width, height } = position;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || width !== height) {
    throw new RangeError("V7 Go rule features require a square board of dimensions >= 2.");
  }
  const area = width * height;
  if (options.opponentEscape && (options.opponentEscape.length !== area ||
      options.opponentEscape.some(value => value !== 0 && value !== 1))) {
    throw new RangeError("opponentEscape must be a board-sized binary mask.");
  }
  const boards = position.recentBoards.map(snapshot => decodeBoard(snapshot, width, height));
  const current = decodeBoard(position.board, width, height);
  if (boards[0].some((row, y) => row.some((stone, x) => stone !== current[y][x]))) {
    throw new Error("recentBoards[0] must match the current board.");
  }

  const currentPlayer: Stone = position.nextPlayer === "B" ? "black" : "white";
  const previousPlayer: Stone = currentPlayer === "black" ? "white" : "black";
  const attackers: Stone[] = [currentPlayer, previousPlayer, currentPlayer];
  const ladderOptions = {
    maxNodes: options.maxLadderNodes,
    maxDepth: options.maxLadderDepth,
  };
  const masks = boards.map((board, index) => findLadderedStones(board, attackers[index], ladderOptions));
  const opponentEscape = options.opponentEscape
    ? new Uint8Array(options.opponentEscape)
    : findLadderEscapePoints(current, previousPlayer, ladderOptions);

  return {
    ladderMasks: {
      current: masks[0],
      previous: masks[1],
      previousPrevious: masks[2],
      opponentEscape,
    },
    areaOwners: encodeAreaOwners(current, currentPlayer),
  };
}


/**
 * Complete V7 input-encoding entry point for callers that have board history
 * but do not want to precompute ladder and area planes themselves.
 */
export function encodeKataGoV7WithDerivedRules(
  position: Omit<KataGoV7Position, "ladderMasks" | "areaOwners">,
  metadata: KataGoOnnxMetadata,
  options: V7RuleFeatureOptions,
): EncodedKataGoV7Inputs {
  const derived = deriveV7RuleFeatures(position, options);
  return encodeKataGoV7({
    ...position,
    ladderMasks: derived.ladderMasks,
    areaOwners: derived.areaOwners,
  }, metadata);
}
