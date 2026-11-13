import {
  getGroup,
  type Board,
  type Stone,
} from "./index";

export interface PassAliveRegion {
  color: Stone;
  points: [number, number][];
  borderingGroups: number[];
}

export interface PassAliveAreaResult {
  /** Owner for each point. null means neutral or not proven pass-alive. */
  owners: (Stone | null)[][];
  /** True for stones in Benson-pass-alive chains. */
  passAliveStones: boolean[][];
  /** Benson-pass-alive chain IDs, grouped by color. */
  aliveGroupIds: Record<Stone, number[]>;
  /** Regions assigned to a pass-alive color. */
  regions: PassAliveRegion[];
}

interface Chain {
  id: number;
  color: Stone;
  stones: [number, number][];
}

interface CandidateRegion {
  points: [number, number][];
  borderingGroups: Set<number>;
  vitalFor: Set<number>;
}

function neighbors(row: number, col: number, size: number): [number, number][] {
  return [
    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
  ].filter(([r, c]) => r >= 0 && c >= 0 && r < size && c < size);
}

function collectChains(board: Board): { chains: Chain[]; groupAt: number[][] } {
  const size = board.length;
  const groupAt = Array.from({ length: size }, () => Array<number>(size).fill(-1));
  const chains: Chain[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const color = board[row][col];
      if (!color || groupAt[row][col] !== -1) continue;
      const stones = getGroup(board, row, col).stones;
      const id = chains.length;
      for (const [r, c] of stones) groupAt[r][c] = id;
      chains.push({ id, color, stones });
    }
  }
  return { chains, groupAt };
}

function regionsForColor(
  board: Board,
  color: Stone,
  groupAt: number[][],
  chains: Chain[],
): CandidateRegion[] {
  const size = board.length;
  const visited = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const regions: CandidateRegion[] = [];

  // Benson regions for a color are connected components of all points that
  // are not occupied by that color (empty points plus opponent stones).
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (board[row][col] === color || visited[row][col]) continue;
      const points: [number, number][] = [];
      const borderingGroups = new Set<number>();
      const queue: [number, number][] = [[row, col]];
      visited[row][col] = true;
      while (queue.length > 0) {
        const [r, c] = queue.pop()!;
        points.push([r, c]);
        for (const [nr, nc] of neighbors(r, c, size)) {
          const neighborColor = board[nr][nc];
          if (neighborColor === color) {
            const id = groupAt[nr][nc];
            if (id >= 0) borderingGroups.add(id);
          } else if (!visited[nr][nc]) {
            visited[nr][nc] = true;
            queue.push([nr, nc]);
          }
        }
      }

      const vitalFor = new Set<number>();
      for (const groupId of borderingGroups) {
        const chain = chains[groupId];
        const adjacent = new Set<string>();
        for (const [r, c] of chain.stones) {
          for (const [nr, nc] of neighbors(r, c, size)) {
            if (board[nr][nc] !== color) adjacent.add(`${nr},${nc}`);
          }
        }
        if (points.every(([r, c]) => adjacent.has(`${r},${c}`))) vitalFor.add(groupId);
      }
      regions.push({ points, borderingGroups, vitalFor });
    }
  }
  return regions;
}

/**
 * Compute a conservative Benson pass-alive area.
 *
 * For each color, iteratively eliminate chains with fewer than two vital
 * regions, then eliminate regions no longer vital to any surviving chain.
 * This is the standard unconditional-life fixed point. It intentionally does
 * not infer life from MCTS ownership, seki heuristics, or arbitrary empty
 * territory; uncertain points remain neutral.
 */
export function calculatePassAliveArea(board: Board): PassAliveAreaResult {
  const size = board.length;
  if (size === 0 || board.some(row => row.length !== size)) {
    throw new RangeError("Pass-alive analysis requires a non-empty square board.");
  }
  const { chains, groupAt } = collectChains(board);
  const owners = Array.from({ length: size }, () => Array<Stone | null>(size).fill(null));
  const passAliveStones = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const aliveGroupIds: Record<Stone, number[]> = { black: [], white: [] };
  const assignedRegions: PassAliveRegion[] = [];

  for (const color of ["black", "white"] as const) {
    const regions = regionsForColor(board, color, groupAt, chains);
    const activeGroups = new Set(chains.filter(chain => chain.color === color).map(chain => chain.id));
    const activeRegions = new Set(regions.map((_, index) => index));

    let changed = true;
    while (changed) {
      changed = false;
      for (const groupId of [...activeGroups]) {
        let vitalCount = 0;
        for (const regionIndex of activeRegions) {
          if (regions[regionIndex].vitalFor.has(groupId)) vitalCount += 1;
        }
        if (vitalCount < 2) {
          activeGroups.delete(groupId);
          changed = true;
        }
      }
      for (const regionIndex of [...activeRegions]) {
        const region = regions[regionIndex];
        const stillVital = [...region.vitalFor].some(groupId => activeGroups.has(groupId));
        if (!stillVital) {
          activeRegions.delete(regionIndex);
          changed = true;
        }
      }
    }

    for (const groupId of activeGroups) {
      aliveGroupIds[color].push(groupId);
      for (const [r, c] of chains[groupId].stones) {
        passAliveStones[r][c] = true;
        owners[r][c] = color;
      }
    }

    for (const regionIndex of activeRegions) {
      const region = regions[regionIndex];
      const bordering = [...region.borderingGroups];
      // A region is safely assigned only if every chain bordering it survived
      // Benson elimination. This keeps unsettled opponent stones/regions neutral.
      if (bordering.length === 0 || !bordering.every(id => activeGroups.has(id))) continue;
      for (const [r, c] of region.points) {
        if (board[r][c] === null) owners[r][c] = color;
      }
      assignedRegions.push({ color, points: region.points, borderingGroups: bordering });
    }
  }

  // Conflicting ownership is not proof of life (typically a seki boundary).
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (board[row][col] !== null) continue;
      const blackRegion = assignedRegions.some(region =>
        region.color === "black" && region.points.some(([r, c]) => r === row && c === col));
      const whiteRegion = assignedRegions.some(region =>
        region.color === "white" && region.points.some(([r, c]) => r === row && c === col));
      if (blackRegion && whiteRegion) owners[row][col] = null;
    }
  }

  return { owners, passAliveStones, aliveGroupIds, regions: assignedRegions };
}
