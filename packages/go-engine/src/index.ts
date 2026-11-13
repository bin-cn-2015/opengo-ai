export type Stone = "black" | "white";
export type Cell = Stone | null;
export type Board = Cell[][];
export type KoRule = "simple" | "positional" | "situational";

export interface MoveResult {
  board: Board;
  captured: number;
}

export interface GameState {
  board: Board;
  toMove: Stone;
  captures: Record<Stone, number>;
  moveNumber: number;
  consecutivePasses: number;
  koRule: KoRule;
  /** Positions reached by stone plays. Passes are exempt from superko checks. */
  history: string[];
  /** Board position that the next player may not recreate under simple ko. */
  simpleKoPosition: string | null;
}

export type GameAction =
  | { type: "play"; row: number; col: number }
  | { type: "pass" };

export function otherColor(color: Stone): Stone {
  return color === "black" ? "white" : "black";
}

export function createBoard(size = 19): Board {
  if (![9, 13, 19].includes(size)) {
    throw new RangeError("Board size must be 9, 13, or 19.");
  }
  return Array.from({ length: size }, () => Array<Cell>(size).fill(null));
}

export function boardKey(board: Board): string {
  return board.map((row) => row.map((cell) => cell === "black" ? "b" : cell === "white" ? "w" : ".").join("")).join("/");
}

function neighbors(row: number, col: number, size: number): [number, number][] {
  return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
    .filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size);
}

export function getGroup(board: Board, row: number, col: number): { stones: [number, number][]; liberties: Set<string> } {
  const color = board[row]?.[col];
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

export function playMove(board: Board, row: number, col: number, color: Stone): MoveResult | null {
  const size = board.length;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= size || col >= size || board[row]?.[col] !== null) return null;

  const next = board.map((line) => [...line]);
  next[row][col] = color;
  let captured = 0;

  for (const [nr, nc] of neighbors(row, col, size)) {
    if (next[nr][nc] !== otherColor(color)) continue;
    const group = getGroup(next, nr, nc);
    if (group.liberties.size === 0) {
      for (const [gr, gc] of group.stones) {
        next[gr][gc] = null;
        captured++;
      }
    }
  }

  if (getGroup(next, row, col).liberties.size === 0) return null;
  return { board: next, captured };
}

export function boardsEqual(a: Board, b: Board): boolean {
  return a.length === b.length && a.every((row, r) =>
    row.length === b[r]?.length && row.every((cell, c) => cell === b[r][c])
  );
}

export function createGame(size = 19, koRule: KoRule = "situational"): GameState {
  const board = createBoard(size);
  const initialKey = positionKey(board, "black", koRule);
  return {
    board,
    toMove: "black",
    captures: { black: 0, white: 0 },
    moveNumber: 0,
    consecutivePasses: 0,
    koRule,
    history: [initialKey],
    simpleKoPosition: null
  };
}

function positionKey(board: Board, nextPlayer: Stone, rule: KoRule): string {
  const key = boardKey(board);
  return rule === "situational" ? `${key} ${nextPlayer}` : key;
}

export function applyAction(state: GameState, action: GameAction): GameState | null {
  if (isGameOver(state)) return null;

  if (action.type === "pass") {
    return {
      ...state,
      toMove: otherColor(state.toMove),
      moveNumber: state.moveNumber + 1,
      consecutivePasses: state.consecutivePasses + 1,
      // A pass breaks the immediate-recapture condition for simple ko.
      simpleKoPosition: null
    };
  }

  const result = playMove(state.board, action.row, action.col, state.toMove);
  if (!result) return null;

  const nextPlayer = otherColor(state.toMove);
  const boardPosition = boardKey(result.board);
  if (state.koRule === "simple" && boardPosition === state.simpleKoPosition) return null;

  const key = positionKey(result.board, nextPlayer, state.koRule);
  if (state.koRule !== "simple" && state.history.includes(key)) return null;

  return {
    ...state,
    board: result.board,
    toMove: nextPlayer,
    captures: { ...state.captures, [state.toMove]: state.captures[state.toMove] + result.captured },
    moveNumber: state.moveNumber + 1,
    consecutivePasses: 0,
    history: [...state.history, key],
    simpleKoPosition: boardKey(state.board)
  };
}

/**
 * Enumerate every legal stone play and pass for the current player.
 * This is intentionally rule-engine-only; MCTS can consume this list without
 * duplicating ko, suicide, capture, or game-over checks.
 */
export function getLegalActions(state: GameState): GameAction[] {
  if (isGameOver(state)) return [];
  const actions: GameAction[] = [];
  for (let row = 0; row < state.board.length; row++) {
    for (let col = 0; col < state.board.length; col++) {
      const action: GameAction = { type: "play", row, col };
      if (applyAction(state, action)) actions.push(action);
    }
  }
  actions.push({ type: "pass" });
  return actions;
}

export function isGameOver(state: GameState): boolean {
  return state.consecutivePasses >= 2;
}
