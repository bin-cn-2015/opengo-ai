import { describe, expect, it } from "vitest";
import { deriveV7RuleFeatures } from "./v7-rule-features";

function position() {
  const board = new Uint8Array(81);
  return {
    width: 9,
    height: 9,
    board,
    nextPlayer: "B" as const,
    recentBoards: [board, board, board] as const,
  };
}

describe("deriveV7RuleFeatures", () => {
  it("derives three ladder history masks and pass-alive area", () => {
    const derived = deriveV7RuleFeatures(position(), {
      opponentEscape: new Uint8Array(81),
    });
    expect(derived.ladderMasks.current).toHaveLength(81);
    expect(derived.ladderMasks.previous).toHaveLength(81);
    expect(derived.ladderMasks.previousPrevious).toHaveLength(81);
    expect(derived.areaOwners).toHaveLength(81);
    expect([...derived.areaOwners].every(value => value === 0)).toBe(true);
  });

  it("rejects a missing or incorrectly sized escape plane instead of inventing one", () => {
    expect(() => deriveV7RuleFeatures(position(), {
      opponentEscape: new Uint8Array(80),
    })).toThrow(/board-sized binary mask/);
  });

  it("rejects history snapshots that do not start with the current board", () => {
    const p = position();
    const wrong = new Uint8Array(81);
    wrong[40] = 1;
    expect(() => deriveV7RuleFeatures({
      ...p,
      recentBoards: [wrong, p.board, p.board],
    }, { opponentEscape: new Uint8Array(81) })).toThrow(/must match the current board/);
  });

  it("encodes pass-alive ownership from the next player's perspective", () => {
    const p = position();
    // A black enclosure with two eyes, isolated from the rest of the board.
    const board = new Uint8Array(81);
    for (let x = 1; x <= 7; x += 1) {
      board[1 * 9 + x] = 1;
      board[5 * 9 + x] = 1;
    }
    for (let y = 1; y <= 5; y += 1) {
      board[y * 9 + 1] = 1;
      board[y * 9 + 7] = 1;
      board[y * 9 + 3] = 1;
      board[y * 9 + 5] = 1;
    }
    const derived = deriveV7RuleFeatures({
      ...p,
      board,
      recentBoards: [board, board, board],
    }, { opponentEscape: new Uint8Array(81) });
    expect(derived.areaOwners[2 * 9 + 2]).toBe(1);
  });
});
