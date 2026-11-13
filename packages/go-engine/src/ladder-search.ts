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
  isLegalMove?: (board: Board, row: number, col: number, color: Stone, path?: readonly string[]) => boolean;
  /** Start with the defender to move after an attacker-first setup move. */
  firstPlayer?: "attacker" | "defender";
  /** Original target points to track; may describe multiple disconnected groups. */
  targetStones?: readonly (readonly [number, number])[];
  /** Prior board/side keys, each encoded as boardKey(board) + "|" + side to move. */
  initialPath?: readonly string[];
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
 * Tactical ladder reading for a target chain and any disconnected target
 * fragments supplied through targetStones.
 *
 * A capture proof is existential across those fragments: capturing any
 * originally surviving fragment proves "captured". Candidate liberty
 * thresholds depend on the side to move (attacker: at most two; defender:
 * at most one), and are evaluated independently for each target group.
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

  const targetPoints = (options.targetStones ?? initialGroup.stones).map(([r, c]) => [r, c] as const);
  if (targetPoints.length === 0 || targetPoints.some(([r, c]) => !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= board.length || c >= board.length)) {
    throw new RangeError("targetStones must contain valid board coordinates.");
  }
  // Coordinates may refer to original stones already captured by a setup
  // move, but at least one original target stone must still be present.
  if (!targetPoints.some(([r, c]) => board[r][c] === targetColor)) {
    throw new RangeError("targetStones must include at least one surviving opponent stone.");
  }
  // Only stones present at the root are tracked. A missing point later
  // means that its target fragment was captured during this search.
  const trackedTargetPoints = targetPoints.filter(([r, c]) => board[r][c] === targetColor);
  const memo = new Map<string, NodeResult>();
  let nodes = 0;
  let cutoff: LadderSearchResult["reason"] | null = null;

  const findTargetGroups = (position: Board): { stones: [number, number][]; liberties: Set<string> }[] => {
    const visited = new Set<string>();
    const groups: { stones: [number, number][]; liberties: Set<string> }[] = [];
    for (const [r, c] of trackedTargetPoints) {
      const point = r + "," + c;
      if (position[r]?.[c] !== targetColor || visited.has(point)) continue;
      const group = getGroup(position, r, c);
      for (const [gr, gc] of group.stones) visited.add(gr + "," + gc);
      groups.push(group);
    }
    return groups;
  };

  const visit = (position: Board, toMove: Stone, depth: number, path: readonly string[]): NodeResult => {
    nodes += 1;
    if (nodes > maxNodes) {
      cutoff = "node-limit";
      return { status: "unknown", pv: [], reason: "node-limit" };
    }
    // This reader asks whether any fragment of the original target can be
    // forced into capture. Once a fragment is captured, the existential
    // target is captured even if another fragment survives elsewhere.
    if (trackedTargetPoints.some(([r, c]) => position[r]?.[c] !== targetColor)) {
      return { status: "captured", pv: [], reason: "captured" };
    }
    const groups = findTargetGroups(position);
    if (groups.length === 0) return { status: "captured", pv: [], reason: "captured" };
    // KataGo's ladder reader uses turn-sensitive thresholds: the attacker
    // can start/continue a ladder against a two-liberty group, but a defender
    // to move with two liberties has already escaped that ladder. Apply this
    // per group so a safe fragment never suppresses another threatened one.
    const maxThreatenedLiberties = toMove === attacker ? 2 : 1;
    const threatenedGroups = groups.filter(group => group.liberties.size <= maxThreatenedLiberties);
    if (threatenedGroups.length === 0) return { status: "escaped", pv: [], reason: "escaped" };
    if (threatenedGroups.some(group => group.liberties.size === 0)) return { status: "captured", pv: [], reason: "captured" };
    if (depth >= maxDepth) {
      cutoff = "depth-limit";
      return { status: "unknown", pv: [], reason: "depth-limit" };
    }

    const positionKey = boardKey(position);
    if (path.includes(positionKey + "|" + toMove)) {
      return { status: "unknown", pv: [], reason: "ko-or-no-legal-move" };
    }
    const groupKey = groups.map(g => g.stones.map(([r,c]) => r + "," + c).sort().join(";")).sort().join("/");
    const key = positionKey + "|" + toMove + "|" + groupKey;
    // History-aware legality can make the same board differ by repetition path.
    const cached = options.isLegalMove ? undefined : memo.get(key);
    if (cached) return cached;

    const candidates = new Set<string>(threatenedGroups.flatMap(group => [...group.liberties]));
    // A defender may also capture an adjacent attacking chain in atari. Its
    // sole liberty is necessarily adjacent to a threatened target fragment.
    if (toMove === targetColor) {
      for (const [r, c] of threatenedGroups.flatMap(group => group.stones)) {
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
    // A legality hook needs the current position as part of the history when
    // validating the next move (superko checks compare the resulting board
    // against all positions already reached, including this one).
    const movePath = [...path, positionKey + "|" + toMove];
    for (const move of candidates) {
      const [mr, mc] = move.split(",").map(Number);
      if (options.isLegalMove && !options.isLegalMove(position, mr, mc, toMove, movePath)) continue;
      const played = playMove(position, mr, mc, toMove);
      if (!played) continue;
      legalMoves += 1;
      children.push({ move, result: visit(played.board, otherColor(toMove), depth + 1, movePath) });
    }

    if (legalMoves === 0) {
      // No local defense candidate is not proof of capture: the defender may
      // have a ko threat, an off-ladder escape, or a legal move omitted by
      // this deliberately local candidate generator.
      const terminal: NodeResult = toMove === attacker
        ? { status: "escaped", pv: [], reason: "escaped" }
        : { status: "unknown", pv: [], reason: "ko-or-no-legal-move" };
      if (!options.isLegalMove) memo.set(key, terminal);
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
    if (!options.isLegalMove) memo.set(key, result);
    return result;
  };

  const firstPlayer = options.firstPlayer ?? "attacker";
  const initialPlayer = firstPlayer === "attacker" ? attacker : targetColor;
  // The path contains ancestors only; including the current node here would
  // incorrectly classify the root as an immediate repetition.
  const result = visit(board, initialPlayer, 0, options.initialPath ?? []);
  return {
    status: result.status,
    target: { row, col },
    attacker,
    nodes,
    principalVariation: result.pv,
    // A cutoff in a sibling branch must not overwrite a proof found elsewhere.
    reason: result.status === "unknown" ? (cutoff ?? result.reason) : result.reason,
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


/**
 * Match KataGo iterLadders' feature-17 workingMoves output for opponent
 * chains with exactly two liberties: mark each legal attacking liberty for
 * which the defender-first ladder reader still proves capture.
 *
 * The returned points are the attack locations that create a ladder, not
 * arbitrary liberties or all liberties of laddered stones.
 */
export function findLadderEscapePoints(
  board: Board,
  opponent: Stone,
  options: LadderSearchOptions = {},
): Uint8Array {
  const size = board.length;
  const mask = new Uint8Array(size * size);
  const targetColor = opponent;
  const attacker = otherColor(targetColor);
  const visited = new Set<string>();

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (board[row][col] !== targetColor) continue;
      const key = `${row},${col}`;
      if (visited.has(key)) continue;
      const group = getGroup(board, row, col);
      for (const [r, c] of group.stones) visited.add(`${r},${c}`);
      if (group.liberties.size !== 2) continue;

      for (const liberty of group.liberties) {
        const [attackRow, attackCol] = liberty.split(",").map(Number);
        const attackPath = [...(options.initialPath ?? []), boardKey(board) + "|" + attacker];
        if (options.isLegalMove &&
            !options.isLegalMove(board, attackRow, attackCol, attacker, attackPath)) continue;
        const played = playMove(board, attackRow, attackCol, attacker);
        if (!played) continue;

        const survivingAnchor = group.stones.find(([r, c]) => played.board[r]?.[c] === targetColor);
        if (!survivingAnchor) {
          mask[attackRow * size + attackCol] = 1;
          continue;
        }

        const reading = searchLadder(
          played.board,
          survivingAnchor[0],
          survivingAnchor[1],
          attacker,
          {
            ...options,
            firstPlayer: "defender",
            targetStones: group.stones,
            // The setup attack is already a played move; retain its parent
            // position so subsequent superko checks see the complete path.
            initialPath: attackPath,
          },
        );
        if (reading.status === "captured") {
          mask[attackRow * size + attackCol] = 1;
        }
      }
    }
  }
  return mask;
}
