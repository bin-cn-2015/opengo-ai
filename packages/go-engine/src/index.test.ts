import { describe, expect, it } from "vitest";
import {
  applyAction, boardKey, boardsEqual, createBoard, createGame, getGroup, getLegalActions, playMove
} from "./index";
import type { Board } from "./index";

describe("board and group primitives", () => {
  it("creates supported board sizes", () => {
    expect(createBoard(9)).toHaveLength(9);
    expect(createBoard(13)).toHaveLength(13);
    expect(createBoard(19)).toHaveLength(19);
    expect(() => createBoard(10)).toThrow();
  });

  it("rejects occupied, out-of-range, and non-integer moves", () => {
    const board = createBoard(9);
    const first = playMove(board, 4, 4, "black")!;
    expect(playMove(first.board, 4, 4, "white")).toBeNull();
    expect(playMove(board, -1, 0, "black")).toBeNull();
    expect(playMove(board, 1.5, 2, "black")).toBeNull();
  });

  it("rejects suicide", () => {
    let board = createBoard(9);
    for (const [r, c] of [[3, 4], [4, 3], [5, 4], [4, 5]] as const) {
      board = playMove(board, r, c, "white")!.board;
    }
    expect(playMove(board, 4, 4, "black")).toBeNull();
  });

  it("captures an isolated stone and updates the board", () => {
    let board = createBoard(9);
    board = playMove(board, 4, 4, "white")!.board;
    board = playMove(board, 3, 4, "black")!.board;
    board = playMove(board, 4, 3, "black")!.board;
    board = playMove(board, 5, 4, "black")!.board;
    const result = playMove(board, 4, 5, "black");
    expect(result?.captured).toBe(1);
    expect(result?.board[4][4]).toBeNull();
  });

  it("counts unique liberties for a connected group", () => {
    const board = createBoard(9);
    board[4][4] = "black";
    board[4][5] = "black";
    expect(getGroup(board, 4, 4).stones).toHaveLength(2);
    expect(getGroup(board, 4, 4).liberties.size).toBe(6);
  });

  it("compares board dimensions and contents", () => {
    expect(boardsEqual(createBoard(9), createBoard(9))).toBe(true);
    expect(boardsEqual(createBoard(9), createBoard(13))).toBe(false);
  });

  it("encodes board positions deterministically", () => {
    const board = createBoard(9);
    board[0][0] = "black";
    board[0][1] = "white";
    expect(boardKey(board).startsWith("bw")).toBe(true);
  });
});

describe("game state and turn handling", () => {
  it("generates all legal actions and always includes pass before game end", () => {
    const game = createGame(9);
    const actions = getLegalActions(game);
    expect(actions).toHaveLength(82);
    expect(actions).toContainEqual({ type: "play", row: 0, col: 0 });
    expect(actions).toContainEqual({ type: "pass" });
  });

  it("does not generate actions after the game has ended", () => {
    let game = createGame(9);
    game = applyAction(game, { type: "pass" })!;
    game = applyAction(game, { type: "pass" })!;
    expect(getLegalActions(game)).toEqual([]);
  });

  it("starts with black to play and zero captures", () => {
    const game = createGame(9);
    expect(game.toMove).toBe("black");
    expect(game.captures).toEqual({ black: 0, white: 0 });
    expect(game.moveNumber).toBe(0);
    expect(game.simpleKoPosition).toBeNull();
  });

  it("alternates turns and counts captures for the player who made them", () => {
    let game = createGame(9);
    for (const [row, col] of [[4, 4], [0, 0], [3, 4], [0, 1], [4, 3], [0, 2], [5, 4], [1, 0]] as const) {
      game = applyAction(game, { type: "play", row, col })!;
    }
    game = applyAction(game, { type: "play", row: 4, col: 5 })!;
    expect(game.captures.black).toBe(1);
    expect(game.toMove).toBe("white");
  });

  it("allows two passes to end the game and rejects later moves", () => {
    let game = createGame(9);
    game = applyAction(game, { type: "pass" })!;
    expect(game.consecutivePasses).toBe(1);
    game = applyAction(game, { type: "pass" })!;
    expect(game.consecutivePasses).toBe(2);
    expect(applyAction(game, { type: "play", row: 4, col: 4 })).toBeNull();
    expect(applyAction(game, { type: "pass" })).toBeNull();
  });

  it("resets the consecutive-pass count after a stone is played", () => {
    let game = createGame(9);
    game = applyAction(game, { type: "pass" })!;
    game = applyAction(game, { type: "play", row: 4, col: 4 })!;
    expect(game.consecutivePasses).toBe(0);
  });

  it("rejects a simple ko recapture on the immediately following move", () => {
    const board = createBoard(9);
    board[3][3] = "black";
    board[5][3] = "black";
    board[4][2] = "black";
    board[3][4] = "white";
    board[5][4] = "white";
    board[4][5] = "white";
    board[4][3] = "white";
    const before = boardKey(board);
    let game = createGame(9, "simple");
    game = { ...game, board, history: [boardKey(createBoard(9)), before] };
    game = applyAction(game, { type: "play", row: 4, col: 4 })!;
    expect(game.captures.black).toBe(1);
    expect(game.simpleKoPosition).toBe(before);
    expect(applyAction(game, { type: "play", row: 4, col: 3 })).toBeNull();
  });

  it("a pass clears the immediate simple-ko restriction", () => {
    let game = createGame(9, "simple");
    game = { ...game, simpleKoPosition: boardKey(createBoard(9)) };
    game = applyAction(game, { type: "pass" })!;
    expect(game.simpleKoPosition).toBeNull();
  });

  it("uses positional history to reject a repeated board position", () => {
    const board = createBoard(9);
    const repeated = boardKey(board);
    const game = { ...createGame(9, "positional"), history: [repeated, "not-the-current-position"] };
    expect(applyAction(game, { type: "play", row: 4, col: 4 })).not.toBeNull();
  });

  it("rejects positional superko repetitions", () => {
    const board = createBoard(9);
    const candidate = playMove(board, 4, 4, "black")!.board;
    const game = {
      ...createGame(9, "positional"),
      history: [boardKey(board), boardKey(candidate)]
    };
    expect(applyAction(game, { type: "play", row: 4, col: 4 })).toBeNull();
  });

  it("rejects situational superko repetitions", () => {
    const board = createBoard(9);
    const candidate = playMove(board, 4, 4, "black")!.board;
    const repeatedSituation = `${boardKey(candidate)} white`;
    const game = {
      ...createGame(9, "situational"),
      history: [`${boardKey(board)} black`, repeatedSituation]
    };
    expect(applyAction(game, { type: "play", row: 4, col: 4 })).toBeNull();
  });

  it("uses situational history keys including the player to move", () => {
    const game = createGame(9, "situational");
    expect(game.history[0]).toBe(`${boardKey(game.board)} black`);
  });

  it("does not mutate the input board", () => {
    const board: Board = createBoard(9);
    const copy = board.map((row) => [...row]);
    playMove(board, 2, 2, "black");
    expect(board).toEqual(copy);
  });
});
