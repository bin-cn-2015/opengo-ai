import { describe, expect, it } from "vitest";
import { boardKey, createBoard, playMove } from "./index";
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



  it("allows the current root position to appear in supplied game history", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[5][4] = "black";
    const result = searchLadder(board, 4, 4, "black", {
      // GameState.history normally includes the current board as its last entry.
      initialPath: [boardKey(board) + "|black"],
    });
    expect(result.status).toBe("captured");
    expect(result.principalVariation[0]).toEqual({ row: 4, col: 5, color: "black" });
  });

  it("returns unknown when a searched non-capturing move recreates an earlier situational position", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    const afterAttack = playMove(board, 4, 5, "black");
    expect(afterAttack).not.toBeNull();

    const result = searchLadder(board, 4, 4, "black", {
      initialPath: [
        boardKey(board) + "|black",
        boardKey(afterAttack!.board) + "|white",
      ],
    });

    expect(result.status).toBe("unknown");
    expect(result.reason).toBe("ko-or-no-legal-move");
  });

  it("does not treat a repeated ko recapture that removes the target as a proven capture", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[5][4] = "black";
    const afterCapture = playMove(board, 4, 5, "black");
    expect(afterCapture).not.toBeNull();

    const result = searchLadder(board, 4, 4, "black", {
      initialPath: [
        boardKey(board) + "|black",
        boardKey(afterCapture!.board) + "|white",
      ],
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

  it("treats a two-liberty target as escaped when the defender is to move", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    let hookCalls = 0;

    const result = searchLadder(board, 4, 4, "black", {
      firstPlayer: "defender",
      isLegalMove: () => {
        hookCalls += 1;
        return true;
      },
    });

    expect(result.status).toBe("escaped");
    expect(hookCalls).toBe(0);
  });

  it("does not let a two-liberty fragment hide a separate atari fragment on the defender turn", () => {
    const board = createBoard(9);
    board[2][2] = "white";
    board[6][6] = "white";
    for (const [r, c] of [[1, 2], [2, 1], [3, 2], [5, 6], [6, 5]] as const) {
      board[r][c] = "black";
    }
    const checked: [number, number][] = [];

    const result = searchLadder(board, 2, 2, "black", {
      firstPlayer: "defender",
      targetStones: [[2, 2], [6, 6]],
      isLegalMove: (_position, row, col) => {
        checked.push([row, col]);
        return false;
      },
    });

    expect(result.status).toBe("unknown");
    expect(checked).toEqual([[2, 3]]);
  });

  it("captures the remaining threatened fragment when the defender can save only one of two", () => {
    const board = createBoard(9);
    board[2][2] = "white";
    board[6][6] = "white";
    for (const [r, c] of [[1, 2], [2, 1], [3, 2], [5, 6], [6, 5], [7, 6]] as const) {
      board[r][c] = "black";
    }

    const result = searchLadder(board, 2, 2, "black", {
      firstPlayer: "defender",
      targetStones: [[2, 2], [6, 6]],
    });

    expect(result.status).toBe("captured");
    expect(result.principalVariation[0]?.color).toBe("white");
    expect(result.principalVariation[1]).toEqual({ row: 6, col: 7, color: "black" });
  });

  it("recognizes a defender extension that connects a threatened fragment to a safe fragment", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[4][6] = "white";
    for (const [r, c] of [[3, 4], [5, 4], [4, 3]] as const) {
      board[r][c] = "black";
    }

    const result = searchLadder(board, 4, 4, "black", {
      firstPlayer: "defender",
      targetStones: [[4, 4], [4, 6]],
    });

    expect(result.status).toBe("escaped");
    expect(result.principalVariation[0]).toEqual({ row: 4, col: 5, color: "white" });
  });

  it("does not search countercaptures after the defender has already escaped with three liberties", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[4][5] = "black";
    board[3][5] = "white";
    board[4][6] = "white";
    let hookCalls = 0;

    const result = searchLadder(board, 4, 4, "black", {
      firstPlayer: "defender",
      targetStones: [[4, 4]],
      isLegalMove: () => {
        hookCalls += 1;
        return true;
      },
    });

    expect(result.status).toBe("escaped");
    expect(result.principalVariation).toEqual([]);
    expect(hookCalls).toBe(0);
  });

  it("uses KataGo's liberty lower bound to recognize a safe defender connection", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[5][4] = "black";
    // The sole extension at (4,5) joins a healthy white chain with many
    // liberties. KataGo's lower bound proves at least three without recursion.
    for (const [r, c] of [[4, 6], [3, 6], [5, 6], [4, 7]] as const) {
      board[r][c] = "white";
    }

    const result = searchLadder(board, 4, 4, "black", { firstPlayer: "defender" });
    expect(result.status).toBe("escaped");
    expect(result.principalVariation).toEqual([{ row: 4, col: 5, color: "white" }]);
    expect(result.nodes).toBe(1);
  });

  it("does not claim capture when the defender has no local candidate accepted by the legality hook", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    board[3][4] = "black";
    board[4][3] = "black";
    board[5][4] = "black";
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

  it("applies KataGo's double-ko-death shortcut when both liberties are ko mouths", () => {
    const board = createBoard(9);
    // The target at (4,4) has two separated liberties. Each liberty is
    // surrounded by white stones and has one adjacent single-stone white
    // chain in atari; filling either point captures that one-stone chain.
    board[4][4] = "white";
    for (const [r, c] of [
      [2, 4], [3, 3], [3, 5], [5, 3], [5, 5], [6, 4],
    ] as const) board[r][c] = "white";
    for (const [r, c] of [
      [1, 4], [2, 3], [2, 5], [4, 2], [4, 3], [4, 5], [4, 6], [6, 3], [6, 5], [7, 4],
    ] as const) board[r][c] = "black";

    const result = searchLadder(board, 4, 4, "black");
    expect(result.status).toBe("captured");
    expect(result.reason).toBe("captured");
    expect(result.nodes).toBe(1);
  });

  it("does not apply the double-ko shortcut when only one liberty is a ko mouth", () => {
    const board = createBoard(9);
    board[4][4] = "white";
    for (const [r, c] of [
      [3, 3], [3, 5], [5, 3], [5, 5], [6, 4],
    ] as const) board[r][c] = "white";
    for (const [r, c] of [
      [1, 4], [2, 3], [2, 5], [4, 3], [4, 5], [6, 3], [6, 5], [7, 4],
    ] as const) board[r][c] = "black";
    // Remove the single-stone atari chain that makes (3,4) a ko mouth.
    let hookCalls = 0;

    const result = searchLadder(board, 4, 4, "black", {
      isLegalMove: () => {
        hookCalls += 1;
        return false;
      },
    });
    expect(hookCalls).toBeGreaterThan(0);
    expect(result.status).not.toBe("captured");
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
