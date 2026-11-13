import {
  boardKey,
  getGroup,
  otherColor,
  playMove,
  type Board,
  type Stone,
} from "./index";

export type LadderStatus = "captured" | "escaped" | "unknown";

export interface LadderSearchOptions {
  /** Hard cap on explored positions. A cutoff returns unknown, never a guess. */
  maxNodes?: number;
  /** Maximum ply depth. A cutoff returns unknown, never a guess. */
  maxDepth?: number;
  /** Optional history/superko legality hook supplied by the caller. */
  isLegalMove?: (board: Board, row: number, col: number, color: Stone) => boolean;
}

export interface LadderSearchResult {
  status: LadderStatus;
  target: { row: number; col: number };
  attacker: Stone;
  nodes: number;
  principalVariation: { row: number; col: number; color: Stone }[];
  reason: "captured" | "escaped" | "node-limit" | "depth-limit" | "ko-or-no-legal-move";
}

interface NodeResult {
  status: LadderStatus;
  pv: { row: number; col: number; color: Stone }[];
  reason: LadderSearchResult["reason"];
}

const DEFAULT_MAX_NODES = 20_000;
const DEFAULT_MAX_DEPTH = 80;

function adjacentPoints(row: number, col: number, size: number): [number, number][] {
  const candidates: [number, number][] = [
    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
  ];
  return candidates.filter(([r, c]) => r >= 0 && c >= 0 && r < size && c < size);
}

/**
 * Tactical ladder reading for a single chain.
 *
 * This is a bounded, rules-engine-level reader, not a full KataGo iterLadders
 * clone: it searches direct ladder extensions, captures of adjacent atari
 * attackers, and alternating atari attacks. Ko/superko history is delegated
 * to isLegalMove. Any resource cutoff is reported as "unknown".
 */
export function searchLadder(
  board: Board,
  row: number,
  col: number,
  attacker: Stone,
  options: LadderSearchOptions = {},
): LadderSearchResult {
  const targetColor = otherColor(attacker);
  const initialGroup = getGroup(board, row, col);
  if (initialGroup.stones.length === 0 || board[row]?.[col] !== targetColor) {
    throw new RangeError("The target coordinate must contain an opponent stone.");
  }

  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isInteger(maxNodes) || maxNodes < 1) throw new RangeError("maxNodes must be a positive integer.");
  if (!Number.isInteger(maxDepth) || maxDepth < 1) throw new RangeError("maxDepth must be a positive integer.");

  const targetPoints = initialGroup.stones.map(([r, c]) => [r, c] as const);
  const memo = new Map<string, NodeResult>();
  let nodes = 0;
  let cutoff: LadderSearchResult["reason"] | null = null;

  const findTargetAnchor = (position: Board): [number, number] | null => {
    for (const [r, c] of targetPoints) {
      if (position[r]?.[c] === targetColor) return [r, c];
    }
    return null;
  };

  const visit = (position: Board, toMove: Stone, depth: number): NodeResult => {
    nodes += 1;
    if (nodes > maxNodes) {
      cutoff = "node-limit";
      return { status: "unknown", pv: [], reason: "node-limit" };
    }
    const anchor = findTargetAnchor(position);
    if (!anchor) return { status: "captured", pv: [], reason: "captured" };

    const group = getGroup(position, anchor[0], anchor[1]);
    if (group.liberties.size > 2) return { status: "escaped", pv: [], reason: "escaped" };
    if (group.liberties.size === 0) return { status: "captured", pv: [], reason: "captured" };
    if (depth >= maxDepth) {
      cutoff = "depth-limit";
      return { status: "unknown", pv: [], reason: "depth-limit" };
    }

    const key = `${boardKey(position)}|${toMove}|${anchor[0]},${anchor[1]}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const candidates = new Set<string>(group.liberties);
    // A defender may also capture an adjacent attacking chain in atari. Its
    // sole liberty is necessarily adjacent to the target group in ladder shape.
    if (toMove === targetColor) {
      for (const [r, c] of group.stones) {
        for (const [nr, nc] of adjacentPoints(r, c, position.length)) {
          if (position[nr][nc] !== attacker) continue;
          const adjacentGroup = getGroup(position, nr, nc);
          if (adjacentGroup.liberties.size === 1) {
            for (const liberty of adjacentGroup.liberties) candidates.add(liberty);
          }
        }
      }
    }

    const children: { move: string; result: NodeResult }[] = [];
    let legalMoves = 0;
    for (const move of candidates) {
      const [mr, mc] = move.split(",").map(Number);
      if (options.isLegalMove && !options.isLegalMove(position, mr, mc, toMove)) continue;
      const played = playMove(position, mr, mc, toMove);
      if (!played) continue;
      legalMoves += 1;
      children.push({ move, result: visit(played.board, otherColor(toMove), depth + 1) });
    }

    if (legalMoves === 0) {
      const terminal: NodeResult = toMove === attacker
        ? { status: "escaped", pv: [], reason: "ko-or-no-legal-move" }
        : { status: "captured", pv: [], reason: "ko-or-no-legal-move" };
      memo.set(key, terminal);
      return terminal;
    }

    // Attacker chooses a line proving capture; defender chooses any escape.
    const desired = toMove === attacker ? "captured" : "escaped";
    const winningChild = children.find(child => child.result.status === desired);
    let result: NodeResult;
    if (winningChild) {
      const [mr, mc] = winningChild.move.split(",").map(Number);
      result = {
        status: desired,
        pv: [{ row: mr, col: mc, color: toMove }, ...winningChild.result.pv],
        reason: winningChild.result.reason,
      };
    } else if (children.some(child => child.result.status === "unknown")) {
      const uncertain = children.find(child => child.result.status === "unknown")!.result;
      result = { status: "unknown", pv: uncertain.pv, reason: uncertain.reason };
    } else {
      const fallback = children[0].result;
      result = {
        status: toMove === attacker ? "escaped" : "captured",
        pv: fallback.pv,
        reason: fallback.reason,
      };
    }
    memo.set(key, result);
    return result;
  };

  const result = visit(board, attacker, 0);
  return {
    status: result.status,
    target: { row, col },
    attacker,
    nodes,
    principalVariation: result.pv,
    reason: cutoff ?? result.reason,
  };
}

/** Mark every stone in chains that are currently in a direct ladder. */
export function findLadderedStones(
  board: Board,
  attacker: Stone,
  options: LadderSearchOptions = {},
): Uint8Array {
  const size = board.length;
  const mask = new Uint8Array(size * size);
  const visited = new Set<string>();
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const color = board[row][col];
      const key = `${row},${col}`;
      if (color !== otherColor(attacker) || visited.has(key)) continue;
      const group = getGroup(board, row, col);
      for (const [r, c] of group.stones) visited.add(`${r},${c}`);
      if (group.liberties.size > 2) continue;
      const result = searchLadder(board, row, col, attacker, options);
      if (result.status === "captured") {
        for (const [r, c] of group.stones) mask[r * size + c] = 1;
      }
    }
  }
  return mask;
}
