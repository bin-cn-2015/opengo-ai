export type Stone = "black" | "white";
export type Cell = Stone | null;
export type Board = Cell[][];
export type KoRule = "simple" | "positional" | "situational";
export type ScoringRule = "area" | "territory";

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
  scoringRule: ScoringRule;
  komi: number;
  /** Negotiated dead-stone coordinates, encoded as "row,col". */
  deadStones: string[];
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
  return ([[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]] as [number, number][])
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
    simpleKoPosition: null,
    scoringRule: "area",
    komi: 7.5,
    deadStones: []
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


export interface TerritoryMap {
  black: number;
  white: number;
  neutral: number;
  /** Territory owner for each empty point: null means neutral or occupied. */
  owners: (Stone | null)[][];
}

export interface ScoreResult {
  rule: ScoringRule;
  komi: number;
  black: number;
  white: number;
  difference: number;
  winner: Stone | "draw";
  territory: TerritoryMap;
  livingStones: Record<Stone, number>;
  prisoners: Record<Stone, number>;
}

/** Configure scoring before or after a game; changing it preserves the board. */
export function setScoringConfig(
  state: GameState,
  scoringRule: ScoringRule,
  komi: number
): GameState {
  if (!Number.isFinite(komi) || komi < 0 || komi > 100000) {
    throw new RangeError("Komi must be a finite non-negative number.");
  }
  return { ...state, scoringRule, komi };
}

/**
 * Mark or unmark the entire connected chain at a coordinate as dead.
 * This is a negotiated scoring annotation and never alters the played board.
 */
export function toggleDeadGroup(state: GameState, row: number, col: number): GameState {
  if (!isGameOver(state)) throw new Error("Dead stones can only be marked after two passes.");
  const color = state.board[row]?.[col];
  if (!color) return state;
  const group = getGroup(state.board, row, col).stones;
  const keys = group.map(([r, c]) => `${r},${c}`);
  const dead = new Set(state.deadStones);
  const allMarked = keys.every((key) => dead.has(key));
  for (const key of keys) {
    if (allMarked) dead.delete(key);
    else dead.add(key);
  }
  return { ...state, deadStones: [...dead].sort() };
}

/** Assign each connected empty region only when it borders exactly one color. */
export function getTerritory(board: Board, deadStones: readonly string[] = []): TerritoryMap {
  const size = board.length;
  const dead = new Set(deadStones);
  const effective = board.map((line, r) => line.map((cell, c) =>
    dead.has(`${r},${c}`) ? null : cell
  ));
  const owners: (Stone | null)[][] = Array.from({ length: size }, () => Array<Stone | null>(size).fill(null));
  const visited = new Set<string>();
  let black = 0, white = 0, neutral = 0;

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (effective[row][col] !== null || visited.has(`${row},${col}`)) continue;
      const queue: [number, number][] = [[row, col]];
      const region: [number, number][] = [];
      const bordering = new Set<Stone>();
      const touchedEdges = new Set<string>();
      visited.add(`${row},${col}`);
      while (queue.length) {
        const [r, c] = queue.pop()!;
        region.push([r, c]);
        if (r === 0) touchedEdges.add("top");
        if (r === size - 1) touchedEdges.add("bottom");
        if (c === 0) touchedEdges.add("left");
        if (c === size - 1) touchedEdges.add("right");
        for (const [nr, nc] of neighbors(r, c, size)) {
          const key = `${nr},${nc}`;
          const cell = effective[nr][nc];
          if (cell) bordering.add(cell);
          else if (!visited.has(key)) {
            visited.add(key);
            queue.push([nr, nc]);
          }
        }
      }
      // A region spanning three or four board edges is open board space, not territory.
      // This avoids awarding the whole empty board to a lone stone or a small wall.
      const openToBoard = touchedEdges.size >= 3;
      const owner = bordering.size === 1 && !openToBoard ? [...bordering][0] : null;
      if (owner === "black") black += region.length;
      else if (owner === "white") white += region.length;
      else neutral += region.length;
      if (owner) for (const [r, c] of region) owners[r][c] = owner;
    }
  }
  return { black, white, neutral, owners };
}

/** Calculate final score. Area scoring counts living stones + territory;
 * territory scoring counts territory + prisoners (including agreed dead stones).
 */
export function calculateScore(state: GameState): ScoreResult {
  if (!isGameOver(state)) throw new Error("The game must end with two passes before scoring.");
  const dead = new Set(state.deadStones);
  const territory = getTerritory(state.board, state.deadStones);
  const livingStones: Record<Stone, number> = { black: 0, white: 0 };
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board.length; c++) {
      const stone = state.board[r][c];
      if (stone && !dead.has(`${r},${c}`)) livingStones[stone]++;
    }
  }
  const deadByColor: Record<Stone, number> = { black: 0, white: 0 };
  for (const key of dead) {
    const [r, c] = key.split(",").map(Number);
    const stone = state.board[r]?.[c];
    if (stone) deadByColor[stone]++;
  }
  const prisoners: Record<Stone, number> = {
    black: state.captures.black + deadByColor.white,
    white: state.captures.white + deadByColor.black
  };
  const black = state.scoringRule === "area"
    ? livingStones.black + territory.black
    : territory.black + prisoners.black;
  const white = (state.scoringRule === "area"
    ? livingStones.white + territory.white
    : territory.white + prisoners.white) + state.komi;
  const difference = black - white;
  return {
    rule: state.scoringRule, komi: state.komi, black, white, difference,
    winner: difference > 0 ? "black" : difference < 0 ? "white" : "draw",
    territory, livingStones, prisoners
  };
}


export { searchLadder, findLadderedStones, findLadderEscapePoints } from "./ladder-search";
export type { LadderSearchOptions, LadderSearchResult, LadderStatus } from "./ladder-search";
export { calculatePassAliveArea } from "./pass-alive";
export type { PassAliveAreaResult, PassAliveRegion } from "./pass-alive";
