export type Stone = "black" | "white";
export type Cell = Stone | null;
export type Board = Cell[][];

export interface MoveResult {
  board: Board;
  captured: number;
}

export function createBoard(size = 19): Board {
  if (![9, 13, 19].includes(size)) {
    throw new RangeError("Board size must be 9, 13, or 19.");
  }
  return Array.from({ length: size }, () => Array<Cell>(size).fill(null));
}

function neighbors(row: number, col: number, size: number): [number, number][] {
  return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
    .filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size);
}

function groupAt(board: Board, row: number, col: number): { stones: [number, number][]; liberties: Set<string> } {
  const color = board[row][col];
  if (!color) return { stones: [], liberties: new Set() };

  const size = board.length;
  const queue: [number, number][] = [[row, col]];
  const visited = new Set<string>([`${row},${col}`]);
  const stones: [number, number][] = [];
  const liberties = new Set<string>();

  while (queue.length) {
    const [r, c] = queue.pop()!;
    stones.push([r, c]);
    for (const [nr, nc] of neighbors(r, c, size)) {
      const key = `${nr},${nc}`;
      if (board[nr][nc] === null) liberties.add(key);
      else if (board[nr][nc] === color && !visited.has(key)) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }
  return { stones, liberties };
}

export function playMove(board: Board, row: number, col: number, color: Stone, previousBoard?: Board): MoveResult | null {
  const size = board.length;
  if (row < 0 || col < 0 || row >= size || col >= size || board[row][col] !== null) return null;

  const next = board.map((line) => [...line]);
  next[row][col] = color;
  let captured = 0;

  for (const [nr, nc] of neighbors(row, col, size)) {
    if (next[nr][nc] !== (color === "black" ? "white" : "black")) continue;
    const group = groupAt(next, nr, nc);
    if (group.liberties.size === 0) {
      for (const [gr, gc] of group.stones) {
        next[gr][gc] = null;
        captured++;
      }
    }
  }

  if (groupAt(next, row, col).liberties.size === 0) return null;
  if (previousBoard && boardsEqual(next, previousBoard)) return null;
  return { board: next, captured };
}

export function boardsEqual(a: Board, b: Board): boolean {
  return a.length === b.length && a.every((row, r) =>
    row.length === b[r]?.length && row.every((cell, c) => cell === b[r][c])
  );
}

export function getGroup(board: Board, row: number, col: number) {
  return groupAt(board, row, col);
}
