import { describe, expect, it } from "vitest";
import { parseSgf, replaySgf, serializeSgf } from "./sgf";

describe("SGF import, export and replay", () => {
  it("replays a main line on 9x9 and supports pass moves", () => {
    const replay = replaySgf(parseSgf("(;GM[1]FF[4]SZ[9]KM[6.5];B[aa];W[];B[bc])").games[0]);
    expect(replay.states).toHaveLength(4);
    expect(replay.states[1].board[0][0]).toBe("black");
    expect(replay.states[2].consecutivePasses).toBe(1);
    expect(replay.states[3].board[1][2]).toBe("black");
    expect(replay.initial.komi).toBe(6.5);
  });

  it("loads root setup stones and player-to-move", () => {
    const replay = replaySgf(parseSgf("(;GM[1]SZ[13]AB[aa][bb]AW[cc]PL[W])").games[0]);
    expect(replay.initial.board[0][0]).toBe("black");
    expect(replay.initial.board[1][1]).toBe("black");
    expect(replay.initial.board[2][2]).toBe("white");
    expect(replay.initial.toMove).toBe("white");
  });

  it("preserves comments, escaped values and variations on serialization", () => {
    const parsed = parseSgf("(;GM[1]SZ[9]C[a\\]b\\\\c](;B[aa])(;B[bb]))");
    const encoded = serializeSgf(parsed);
    const again = parseSgf(encoded);
    expect(again.games[0].properties.C).toEqual(["a]b\\c"]);
    expect(again.games[0].children).toHaveLength(2);
  });

  it("rejects invalid coordinates and illegal moves", () => {
    expect(() => replaySgf(parseSgf("(;GM[1]SZ[9];B[jj])").games[0])).toThrow();
    expect(() => replaySgf(parseSgf("(;GM[1]SZ[9];B[aa];W[aa])").games[0])).toThrow();
  });

  it("rejects malformed SGF syntax", () => {
    expect(() => parseSgf("(;GM[1]SZ[9]")).toThrow();
    expect(() => parseSgf("")).toThrow();
  });
});
