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
  return ([
    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
  ] as [number, number][]).filter(([r, c]) => r >= 0 && c >= 0 && r < size && c < size);
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

  // A Benson region is a connected component of points not occupied by this
  // color (empty points plus opponent stones); own chains form its boundary.
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
          if (board[nr][nc] === color) {
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
        const adjacent = new Set<string>();
        for (const [r, c] of chains[groupId].stones) {
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

function bensonFixedPoint(
  chains: Chain[],
  regions: CandidateRegion[],
  color: Stone,
): { groups: Set<number>; regions: Set<number> } {
  const groups = new Set(chains.filter(chain => chain.color === color).map(chain => chain.id));
  const activeRegions = new Set(regions.map((_, index) => index));
  let changed = true;
  while (changed) {
    changed = false;
    for (const groupId of [...groups]) {
      let vitalCount = 0;
      for (const regionIndex of activeRegions) {
        if (regions[regionIndex].vitalFor.has(groupId)) vitalCount += 1;
      }
      if (vitalCount < 2) {
        groups.delete(groupId);
        changed = true;
      }
    }
    for (const regionIndex of [...activeRegions]) {
      const stillVital = [...regions[regionIndex].vitalFor].some(groupId => groups.has(groupId));
      if (!stillVital) {
        activeRegions.delete(regionIndex);
        changed = true;
      }
    }
  }
  return { groups, regions: activeRegions };
}

/**
 * Conservative Benson unconditional-life and pass-alive-area calculation.
 *
 * The fixed point identifies chains with at least two vital regions. Area is
 * assigned only to empty points in surviving regions whose bordering chains
 * all survive, and which do not contain an opponent's Benson-alive stones.
 * This is not KataGo's complete Board::calculateArea implementation: it does
 * not model suicide-rule overrides, safe/unsafe big territories, or seki tax.
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

  const byColor = {
    black: regionsForColor(board, "black", groupAt, chains),
    white: regionsForColor(board, "white", groupAt, chains),
  };
  const fixed = {
    black: bensonFixedPoint(chains, byColor.black, "black"),
    white: bensonFixedPoint(chains, byColor.white, "white"),
  };

  for (const color of ["black", "white"] as const) {
    for (const groupId of fixed[color].groups) {
      aliveGroupIds[color].push(groupId);
      for (const [r, c] of chains[groupId].stones) {
        passAliveStones[r][c] = true;
        owners[r][c] = color;
      }
    }
  }

  const assignedRegions: PassAliveRegion[] = [];
  const conflictingOwnership = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  for (const color of ["black", "white"] as const) {
    const opponent: Stone = color === "black" ? "white" : "black";
    for (const regionIndex of fixed[color].regions) {
      const region = byColor[color][regionIndex];
      const bordering = [...region.borderingGroups];
      if (bordering.length === 0 || !bordering.every(id => fixed[color].groups.has(id))) continue;
      // A living opposing chain inside this non-color component prevents the
      // component from being safely claimed as this color's pass-alive area.
      const containsOpponentAlive = region.points.some(([r, c]) =>
        board[r][c] === opponent && passAliveStones[r][c]);
      if (containsOpponentAlive) continue;
      for (const [r, c] of region.points) {
        if (board[r][c] !== null || conflictingOwnership[r][c]) continue;
        if (owners[r][c] !== null && owners[r][c] !== color) {
          owners[r][c] = null;
          conflictingOwnership[r][c] = true;
        } else {
          owners[r][c] = color;
        }
      }
      assignedRegions.push({ color, points: region.points, borderingGroups: bordering });
    }
  }

  // A shared empty point is not a proven territory for either side (e.g. seki).
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (board[row][col] !== null) continue;
      const adjacentColors = new Set<Stone>();
      for (const [nr, nc] of neighbors(row, col, size)) {
        if (passAliveStones[nr][nc]) adjacentColors.add(board[nr][nc]!);
      }
      if (adjacentColors.size > 1) owners[row][col] = null;
    }
  }

  return { owners, passAliveStones, aliveGroupIds, regions: assignedRegions };
}
