import { describe, expect, it } from "vitest";
import { createBoard, type Stone } from "./index";
import { searchLadder } from "./ladder-search";

/**
 * Source-derived golden cases for tactical shortcuts in KataGo
 * cpp/game/board.cpp. These are not yet outputs captured from a compiled
 * KataGo binary; provenance identifies the upstream predicate each case tests.
 */
interface ReferenceCase {
  id: string;
  provenance: string;
  stones: readonly (readonly [Stone, number, number])[];
  target: readonly [number, number];
  attacker: Stone;
  firstPlayer: "attacker" | "defender";
  expected: "captured" | "escaped" | "unknown";
  expectedNodes?: number;
}

const referenceCases: readonly ReferenceCase[] = [
  {
    id: "double-ko-guard-rejects-three-liberty-connection",
    provenance: "Both ko mouths pass wouldBeKoCapture, but defender connection leaves 3 liberties so KataGo does not take the shortcut",
    stones: [
      ["white", 4, 4],
      ["white", 2, 4], ["white", 3, 3], ["white", 3, 5],
      ["white", 5, 3], ["white", 5, 5], ["white", 6, 4],
      ["black", 1, 4], ["black", 2, 3], ["black", 2, 5],
      ["black", 4, 2], ["black", 4, 3], ["black", 4, 5],
      ["black", 4, 6], ["black", 6, 3], ["black", 6, 5], ["black", 7, 4],
    ],
    target: [4, 4],
    attacker: "black",
    firstPlayer: "attacker",
    expected: "escaped",
  },
  {
    id: "defender-sole-response-upper-bound-capture",
    provenance: "Board::getBoundNumLibertiesAfterPlay upperBound <= 1; capture verified by recursive play",
    stones: [
      ["white", 4, 4],
      ["black", 3, 4], ["black", 4, 3], ["black", 5, 4],
      ["black", 3, 5], ["black", 5, 5],
    ],
    target: [4, 4],
    attacker: "black",
    firstPlayer: "defender",
    expected: "captured",
    expectedNodes: 3,
  },
  {
    id: "defender-connection-lower-bound",
    provenance: "Board::getBoundNumLibertiesAfterPlay lowerBound >= 3",
    stones: [
      ["white", 4, 4], ["white", 4, 6], ["white", 3, 6],
      ["white", 5, 6], ["white", 4, 7],
      ["black", 3, 4], ["black", 4, 3], ["black", 5, 4],
    ],
    target: [4, 4],
    attacker: "black",
    firstPlayer: "defender",
    expected: "escaped",
    expectedNodes: 1,
  },
];

describe("KataGo source-derived ladder reference corpus", () => {
  it.each(referenceCases)("$id ($provenance)", (fixture) => {
    const board = createBoard(9);
    for (const [color, row, col] of fixture.stones) {
      board[row][col] = color;
    }

    const result = searchLadder(board, fixture.target[0], fixture.target[1], fixture.attacker, {
      firstPlayer: fixture.firstPlayer,
    });

    expect(result.status).toBe(fixture.expected);
    if (fixture.expectedNodes !== undefined) {
      expect(result.nodes).toBe(fixture.expectedNodes);
    }
  });
});
