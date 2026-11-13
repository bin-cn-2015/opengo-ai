import { afterAll, describe, expect, it } from "vitest";
import { createBoard, type Stone } from "./index";
import { searchLadder } from "./ladder-search";
import { generatedLadderCases } from "./katago-ladder-generated.cases";

const divergences: string[] = [];

describe("generated KataGo C++ ladder differential corpus", () => {
  it("loads the deterministic generated corpus", () => {
    expect(Array.isArray(generatedLadderCases)).toBe(true);
  });

  it("covers board regions and both sides to move evenly when oracle fixtures are present", () => {
    if (generatedLadderCases.length === 0) return;
    const countRegion = (region: string) =>
      generatedLadderCases.filter(fixture => fixture.targetRegion === region).length;
    expect(countRegion("corner-band")).toBe(32);
    expect(countRegion("edge-band")).toBe(32);
    expect(countRegion("interior")).toBe(32);
    expect(generatedLadderCases.filter(fixture => fixture.firstPlayer === "attacker")).toHaveLength(48);
    expect(generatedLadderCases.filter(fixture => fixture.firstPlayer === "defender")).toHaveLength(48);
  });

  it.each(generatedLadderCases)("$id (root liberties: $targetLibertiesAtRoot)", (fixture) => {
    const board = createBoard(fixture.size);
    for (const [color, row, col] of fixture.stones) {
      board[row][col] = color as Stone;
    }

    const result = searchLadder(
      board,
      fixture.target[0],
      fixture.target[1],
      fixture.attacker,
      { firstPlayer: fixture.firstPlayer },
    );

    expect(["captured", "escaped", "unknown"]).toContain(result.status);
    expect(result.nodes).toBeGreaterThan(0);
    if (result.status !== fixture.expected) {
      divergences.push(`${fixture.id}: C++=${fixture.expected}, TS=${result.status}, reason=${result.reason}`);
    }
  });
});

afterAll(() => {
  if (generatedLadderCases.length > 0) {
    console.info(
      `KataGo generated differential: ${generatedLadderCases.length - divergences.length}/${generatedLadderCases.length} exact status matches; ${divergences.length} semantic/resource divergences`,
    );
    for (const divergence of divergences.slice(0, 20)) console.info(`  ${divergence}`);
    expect(divergences, "generated TS statuses must match the pinned KataGo oracle").toEqual([]);
  }
});
