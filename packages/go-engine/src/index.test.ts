import { describe, expect, it } from "vitest";
import { createBoard, playMove } from "./index";

describe("Go board rules", () => {
  it("creates supported board sizes", () => {
    expect(createBoard(9)).toHaveLength(9);
    expect(createBoard(13)).toHaveLength(13);
    expect(createBoard(19)).toHaveLength(19);
    expect(() => createBoard(10)).toThrow();
  });

  it("rejects occupied points and out-of-range moves", () => {
    const board = createBoard(9);
    const first = playMove(board, 4, 4, "black")!;
    expect(playMove(first.board, 4, 4, "white")).toBeNull();
    expect(playMove(board, -1, 0, "black")).toBeNull();
  });

  it("rejects suicide", () => {
    let board = createBoard(9);
    for (const [r, c] of [[3, 4], [4, 3], [5, 4], [4, 5]] as const) {
      board = playMove(board, r, c, "white")!.board;
    }
    expect(playMove(board, 4, 4, "black")).toBeNull();
  });

  it("captures a surrounded single stone", () => {
    let board = createBoard(9);
    board = playMove(board, 4, 4, "white")!.board;
    board = playMove(board, 3, 4, "black")!.board;
    board = playMove(board, 4, 3, "black")!.board;
    board = playMove(board, 5, 4, "black")!.board;
    const result = playMove(board, 4, 5, "black");
    expect(result?.captured).toBe(1);
    expect(result?.board[4][4]).toBeNull();
  });
});
