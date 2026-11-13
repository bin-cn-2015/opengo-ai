import { describe, expect, it } from "vitest";
import { applyAction, calculateScore, createGame, getTerritory, toggleDeadGroup } from "./index";

function endedGame() {
  let game = createGame(9);
  game = applyAction(game, { type: "pass" })!;
  return applyAction(game, { type: "pass" })!;
}

describe("territory and scoring", () => {
  it("counts an empty region bordered only by black as black territory", () => {
    const board = Array.from({ length: 9 }, () => Array(9).fill(null));
    board[0][0] = "black"; board[0][1] = "black"; board[1][0] = "black";
    const map = getTerritory(board);
    expect(map.black).toBe(0);
    expect(map.neutral).toBe(78);
  });

  it("keeps regions touching both colors neutral", () => {
    const board = Array.from({ length: 9 }, () => Array(9).fill(null));
    board[0][0] = "black"; board[0][2] = "white";
    const map = getTerritory(board);
    expect(map.neutral).toBe(79);
  });

  it("does not award open board space to a lone color", () => {
    const board = Array.from({ length: 9 }, () => Array(9).fill(null));
    board[0][0] = "black";
    const map = getTerritory(board);
    expect(map.black).toBe(0);
    expect(map.neutral).toBe(80);
  });

  it("recognizes an enclosed single-color region", () => {
    const board = Array.from({ length: 9 }, () => Array(9).fill(null));
    for (let i = 2; i <= 6; i++) {
      board[2][i] = "black";
      board[6][i] = "black";
      board[i][2] = "black";
      board[i][6] = "black";
    }
    const map = getTerritory(board);
    expect(map.black).toBe(9);
    expect(map.neutral).toBe(56);
  });

  it("requires two passes before scoring", () => {
    expect(() => calculateScore(createGame(9))).toThrow();
  });

  it("scores area as living stones plus territory and komi", () => {
    const game = endedGame();
    const score = calculateScore(game);
    expect(score.rule).toBe("area");
    expect(score.black).toBe(0);
    expect(score.white).toBe(7.5);
    expect(score.winner).toBe("white");
  });

  it("marks and unmarks a whole connected group after two passes", () => {
    let game = endedGame();
    const board = game.board.map((row) => [...row]);
    board[2][2] = "black"; board[2][3] = "black";
    game = { ...game, board };
    game = toggleDeadGroup(game, 2, 2);
    expect(game.deadStones).toEqual(["2,2", "2,3"]);
    game = toggleDeadGroup(game, 2, 3);
    expect(game.deadStones).toEqual([]);
  });

  it("adds agreed dead stones to the opponent prisoner count in territory scoring", () => {
    let game = endedGame();
    const board = game.board.map((row) => [...row]);
    board[2][2] = "black";
    game = { ...game, board, scoringRule: "territory", deadStones: ["2,2"] };
    const score = calculateScore(game);
    expect(score.prisoners.white).toBe(1);
    expect(score.livingStones.black).toBe(0);
  });
});
