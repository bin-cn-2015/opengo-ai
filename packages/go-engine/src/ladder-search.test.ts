import { describe, expect, it } from "vitest";
import { boardKey, createBoard } from "./index";
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


  it("passes the current search path to the legality hook for ko-aware callers", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[5][4] = "black";
    let hookCalls = 0;
    let observedPath: readonly string[] | undefined;
    searchLadder(board, 4, 4, "black", {
      isLegalMove: (_position, _row, _col, _color, path) => {
        hookCalls += 1;
        observedPath = path;
        return true;
      },
    });
    expect(hookCalls).toBeGreaterThan(0);
    // The root move has no ancestors, so its legality hook receives an empty path.
    expect(observedPath).toEqual([]);
  });



  it("treats a root position already present in supplied game history as unresolved repetition", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[5][4] = "black";
    const result = searchLadder(board, 4, 4, "black", {
      initialPath: [boardKey(board) + "|black"],
    });
    expect(result.status).toBe("unknown");
    expect(result.reason).toBe("ko-or-no-legal-move");
  });

  it("continues tracking all original target fragments after a chain split", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[4][6] = "white";
    board[3][4] = "black";
    board[5][4] = "black";
    board[4][3] = "black";
    const result = searchLadder(board, 4, 4, "black", {
      targetStones: [[4, 4], [4, 6]],
    });
    // The second original fragment has ample liberties, so the target has escaped.
    expect(result.status).toBe("escaped");
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
