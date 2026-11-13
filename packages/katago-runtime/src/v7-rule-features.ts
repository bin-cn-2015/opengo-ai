import {
  findLadderedStones,
  calculatePassAliveArea,
  type Board,
  type Stone,
} from "../../go-engine/src";
import type { KataGoV7Position, V7LadderMasks } from "./feature-encoder-v7";

export interface V7RuleFeatureOptions {
  /** Exact KataGo-compatible iterLadders escape-point plane. Never guessed. */
  opponentEscape: Uint8Array;
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
 * The opponentEscape plane is required from a KataGo-compatible iterLadders
 * implementation. The current TS ladder reader does not yet produce that
 * exact escape-point output, so this adapter refuses to invent an all-zero
 * plane and misrepresent it as complete V7 feature parity.
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
  if (options.opponentEscape.length !== area ||
      options.opponentEscape.some(value => value !== 0 && value !== 1)) {
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
  const masks = boards.map((board, index) => findLadderedStones(board, attackers[index], {
    maxNodes: options.maxLadderNodes,
    maxDepth: options.maxLadderDepth,
  }));

  return {
    ladderMasks: {
      current: masks[0],
      previous: masks[1],
      previousPrevious: masks[2],
      opponentEscape: new Uint8Array(options.opponentEscape),
    },
    areaOwners: encodeAreaOwners(current, currentPlayer),
  };
}
