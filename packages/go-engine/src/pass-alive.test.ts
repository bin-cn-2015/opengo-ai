import { describe, expect, it } from "vitest";
import { createBoard } from "./index";
import { calculatePassAliveArea } from "./pass-alive";

describe("Benson pass-alive area", () => {
  it("does not mark empty board or a lone chain as unconditionally alive", () => {
    expect(calculatePassAliveArea(createBoard(9)).aliveGroupIds.black).toEqual([]);
    const board = createBoard(9);
    board[4][4] = "black";
    expect(calculatePassAliveArea(board).passAliveStones[4][4]).toBe(false);
  });

  it("recognizes a solid black ring with two separate vital eyes", () => {
    const board = createBoard(9);
    // Closed rectangular wall with two internal empty regions separated by black.
    for (let col = 1; col <= 7; col += 1) {
      board[1][col] = "black";
      board[5][col] = "black";
    }
    for (let row = 1; row <= 5; row += 1) {
      board[row][1] = "black";
      board[row][7] = "black";
      board[row][3] = "black";
      board[row][5] = "black";
    }
    const result = calculatePassAliveArea(board);
    expect(result.passAliveStones[2][2]).toBe(false);
    expect(result.aliveGroupIds.black.length).toBeGreaterThan(0);
  });

  it("keeps an unsettled one-eye group unconfirmed", () => {
    const board = createBoard(9);
    for (let col = 2; col <= 6; col += 1) {
      board[2][col] = "black";
      board[6][col] = "black";
    }
    for (let row = 2; row <= 6; row += 1) {
      board[row][2] = "black";
      board[row][6] = "black";
    }
    const result = calculatePassAliveArea(board);
    expect(result.passAliveStones[2][2]).toBe(false);
  });
});
