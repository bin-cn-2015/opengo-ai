import { describe, expect, it } from "vitest";
import { createBoard } from "./index";
import { findLadderedStones, findLadderEscapePoints, searchLadder } from "./ladder-search";

describe("ladder search", () => {
  it("rejects a target that is not an opponent stone", () => {
    expect(() => searchLadder(createBoard(9), 0, 0, "black")).toThrow(/opponent stone/);
  });

  it("reports an already captured target as invalid input only when no stone is present", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    const result = searchLadder(board, 4, 4, "black");
    expect(["captured", "escaped", "unknown"]).toContain(result.status);
    expect(result.nodes).toBeGreaterThan(0);
  });

  it("marks every stone in a chain that is immediately capturable", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[5][4] = "black";
    const result = searchLadder(board, 4, 4, "black");
    expect(result.status).toBe("captured");
    expect(result.principalVariation[0]).toEqual({ row: 4, col: 5, color: "black" });
    const mask = findLadderedStones(board, "black");
    expect(mask[4 * 9 + 4]).toBe(1);
  });

  it("returns unknown rather than a false reading when a search budget is exhausted", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[4][3] = "black";
    board[3][4] = "black";
    const result = searchLadder(board, 4, 4, "black", { maxNodes: 1 });
    expect(result.status).toBe("unknown");
    expect(result.reason).toBe("node-limit");
  });
});


describe("ladder escape points", () => {
  it("marks an attacking liberty that forces a defender-first ladder", () => {
    const board = createBoard(9);
    board[3][3] = "white";
    board[2][3] = "black";
    board[3][2] = "black";
    board[5][3] = "black";
    board[4][2] = "black";
    board[4][4] = "black";

    const mask = findLadderEscapePoints(board, "white");
    expect(mask[3 * 9 + 4]).toBe(1);
    // Both liberties are legal attacking moves that force a ladder in this fixture.
    expect(mask[4 * 9 + 3]).toBe(1);
  });
});
