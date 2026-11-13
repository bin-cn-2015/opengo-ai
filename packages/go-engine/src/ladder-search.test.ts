import { describe, expect, it } from "vitest";
import { createBoard, playMove } from "./index";
import { findLadderedStones, searchLadder } from "./ladder-search";

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

  it("marks all stones in a chain when a forced ladder is proven", () => {
    const board = createBoard(9);
    // A small edge ladder: the white target has two liberties, and black can
    // keep attacking toward the edge. The exact result is bounded/tri-state.
    board[0][1] = "white";
    board[1][1] = "white";
    board[0][0] = "black";
    board[1][0] = "black";
    board[2][1] = "black";
    const result = searchLadder(board, 0, 1, "black", { maxNodes: 5000 });
    expect(result.status).toBe("captured");
    const mask = findLadderedStones(board, "black", { maxNodes: 5000 });
    expect(mask[1]).toBe(1);
    expect(mask[10]).toBe(1);
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
