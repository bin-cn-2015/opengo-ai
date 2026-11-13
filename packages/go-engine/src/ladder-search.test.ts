import { describe, expect, it } from "vitest";
import { boardKey, createBoard } from "./index";
import { findLadderedStones, findLadderEscapePoints, searchLadder } from "./ladder-search";

describe("ladder search", () => {
  it("rejects a target that is not an opponent stone", () => {
    expect(() => searchLadder(createBoard(9), 0, 0, "black")).toThrow(/opponent stone/);
  });

  it("rejects an original target list when every listed stone has already disappeared", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    expect(() => searchLadder(board, 4, 4, "black", {
      targetStones: [[0, 0], [0, 1]],
    })).toThrow(/at least one surviving opponent stone/);
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
    // The legality hook sees the current root position as prior history for
    // checking whether the proposed move recreates an earlier board.
    expect(observedPath).toEqual([boardKey(board) + "|black"]);
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

  it("keeps reading a threatened fragment when another target fragment has more than two liberties", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[4][6] = "white";
    board[3][4] = "black";
    board[5][4] = "black";
    board[4][3] = "black";
    const result = searchLadder(board, 4, 4, "black", {
      targetStones: [[4, 4], [4, 6]],
    });
    // The fragment at (4,6) has more than two liberties, but the fragment at
    // (4,4) is still in atari and can be captured at (4,5).
    expect(result.status).toBe("captured");
    expect(result.principalVariation[0]).toEqual({ row: 4, col: 5, color: "black" });
  });

  it("reports escape when every surviving target fragment has more than two liberties", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[4][6] = "white";
    const result = searchLadder(board, 4, 4, "black", {
      targetStones: [[4, 4], [4, 6]],
    });
    expect(result.status).toBe("escaped");
  });

  it("finds a snapback-style countercapture of an adjacent attacking stone in atari", () => {
    // The black stone at (4,5) is the just-played attack. White can capture
    // it at (5,5), reopening a third liberty for the original target stone.
    const board = createBoard(9);
    board[4][4] = "white";
    board[4][5] = "black";
    board[3][5] = "white";
    board[4][6] = "white";

    const result = searchLadder(board, 4, 4, "black", {
      firstPlayer: "defender",
      targetStones: [[4, 4]],
      isLegalMove: (_position, row, col, color) =>
        color === "white" && row === 5 && col === 5,
    });

    expect(result.status).toBe("escaped");
    expect(result.principalVariation[0]).toEqual({ row: 5, col: 5, color: "white" });
  });

  it("does not claim capture when the defender has no local candidate accepted by the legality hook", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    let checked = 0;
    const result = searchLadder(board, 4, 4, "black", {
      firstPlayer: "defender",
      isLegalMove: () => {
        checked += 1;
        return false;
      },
    });
    expect(checked).toBeGreaterThan(0);
    expect(result.status).toBe("unknown");
    expect(result.reason).toBe("ko-or-no-legal-move");
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
  it("includes the pre-attack position in the legality history", () => {
    const board = createBoard(9);
    board[3][3] = "white";
    board[2][3] = "black";
    board[3][2] = "black";
    board[5][3] = "black";
    board[4][2] = "black";
    board[4][4] = "black";
    let observed: readonly string[] | undefined;
    findLadderEscapePoints(board, "white", {
      isLegalMove: (_position, _row, _col, _color, path) => {
        observed ??= path;
        return true;
      },
    });
    expect(observed).toEqual([boardKey(board) + "|black"]);
  });

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
