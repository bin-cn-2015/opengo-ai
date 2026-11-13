import { describe, expect, it } from "vitest";
import { encodeKataGoV7, type KataGoV7Position } from "./feature-encoder-v7";
import type { KataGoOnnxMetadata } from "./model-metadata";

const metadata: KataGoOnnxMetadata = {
  metadataVersion: 1,
  name: "kata1-tf3-b11c768-s12382M-d6533M",
  modelVersion: 17,
  numInputChannels: 22,
  numInputGlobalChannels: 19,
  numInputMetaChannels: 0,
  numPolicyChannels: 4,
  numValueChannels: 3,
  numScoreValueChannels: 6,
  numOwnershipChannels: 1,
  metaEncoderVersion: 0,
  preferPassAliveUnderSuicideRules: false,
  preferExcludeTerritoryAdjacentToAtari: false,
  nnXLen: 5,
  nnYLen: 5,
  requireExactNNLen: false,
};

function emptyPosition(overrides: Partial<KataGoV7Position> = {}): KataGoV7Position {
  const board = new Uint8Array(25);
  const zeroMask = () => new Uint8Array(25);
  return {
    width: 5,
    height: 5,
    board,
    nextPlayer: "B",
    moves: [],
    validTurnsThisPhase: 0,
    recentBoards: [board, board, board],
    superKoBanned: zeroMask(),
    koRecapBlocked: zeroMask(),
    encorePhase: 0,
    rules: {
      koRule: "situational",
      scoringRule: "area",
      taxRule: "none",
      multiStoneSuicideLegal: false,
    },
    selfKomi: -7.5,
    passWouldEndPhase: false,
    areaOwners: new Uint8Array(25),
    ladderMasks: {
      current: zeroMask(),
      previous: zeroMask(),
      previousPrevious: zeroMask(),
      opponentEscape: zeroMask(),
    },
    ...overrides,
  };
}

function at(channel: number, x: number, y: number, bufferWidth = 5): number {
  return channel * 25 + y * bufferWidth + x;
}

describe("encodeKataGoV7", () => {
  it("creates NCHW 22xYxX spatial data and an identical channel-0 mask", () => {
    const position = emptyPosition({
      width: 3,
      height: 3,
      board: new Uint8Array(9),
      recentBoards: [new Uint8Array(9), new Uint8Array(9), new Uint8Array(9)],
      superKoBanned: new Uint8Array(9),
      koRecapBlocked: new Uint8Array(9),
      areaOwners: new Uint8Array(9),
      ladderMasks: {
        current: new Uint8Array(9),
        previous: new Uint8Array(9),
        previousPrevious: new Uint8Array(9),
        opponentEscape: new Uint8Array(9),
      },
    });
    const encoded = encodeKataGoV7(position, metadata);
    expect(encoded.spatial).toHaveLength(22 * 25);
    expect(encoded.global).toHaveLength(19);
    expect(encoded.mask).toHaveLength(25);
    expect(encoded.spatial.slice(0, 25)).toEqual(encoded.mask);
    expect(encoded.mask[0]).toBe(1);
    expect(encoded.mask[2]).toBe(1);
    expect(encoded.mask[3]).toBe(0);
    expect(encoded.mask[10]).toBe(0);
  });

  it("encodes player-relative stones and exact 1/2/3-liberty buckets", () => {
    // Black to move: a white stone in atari at (1,1), black stones with 2 and 3 liberties.
    const board = new Uint8Array(25);
    board[12] = 2;
    board[7] = 1;
    board[11] = 1;
    board[13] = 1;
    board[0] = 1;
    board[22] = 1;
    const position = emptyPosition({ board, recentBoards: [board, board, board] });
    const encoded = encodeKataGoV7(position, metadata);
    expect(encoded.spatial[at(2, 2, 2)]).toBe(1);
    expect(encoded.spatial[at(3, 2, 2)]).toBe(1);
    expect(encoded.spatial[at(1, 0, 0)]).toBe(1);
    expect(encoded.spatial[at(4, 0, 0)]).toBe(1);
    expect(encoded.spatial[at(5, 2, 4)]).toBe(1);
  });

  it("encodes move history planes and pass flags in reverse chronological order", () => {
    const position = emptyPosition({
      moves: [
        { player: "B", x: 0, y: 0 },
        { player: "W", x: 1, y: 0 },
        { player: "B", x: null, y: null },
        { player: "W", x: 3, y: 3 },
      ],
      validTurnsThisPhase: 4,
    });
    const encoded = encodeKataGoV7(position, metadata);
    expect(encoded.spatial[at(9, 3, 3)]).toBe(1);
    expect(encoded.global[0]).toBe(0);
    expect(encoded.spatial[at(10, 0, 0)]).toBe(0);
    // The second most recent move is black's pass.
    expect(encoded.global[1]).toBe(1);
    expect(encoded.spatial[at(11, 1, 0)]).toBe(1);
    expect(encoded.spatial[at(12, 0, 0)]).toBe(1);
  });

  it("encodes rules, komi, pass-end and button global features", () => {
    const encoded = encodeKataGoV7(emptyPosition({
      passWouldEndPhase: true,
      hasButton: true,
      rules: {
        koRule: "situational",
        scoringRule: "territory",
        taxRule: "all",
        multiStoneSuicideLegal: true,
      },
    }), metadata);
    expect(encoded.global[5]).toBeCloseTo(-7.5 / 20);
    expect(encoded.global[6]).toBe(1);
    expect(encoded.global[7]).toBe(-0.5);
    expect(encoded.global[8]).toBe(1);
    expect(encoded.global[9]).toBe(1);
    expect(encoded.global[10]).toBe(1);
    expect(encoded.global[11]).toBe(1);
    expect(encoded.global[14]).toBe(1);
    expect(encoded.global[17]).toBe(1);
  });

  it("encodes the simple-ko point in the normal-play ko-ban plane", () => {
    const encoded = encodeKataGoV7(emptyPosition({ simpleKoPoint: 12 }), metadata);
    expect(encoded.spatial[at(6, 2, 2)]).toBe(1);
  });

  it("encodes ko bans and encore recapture blocks into V7 planes", () => {
    const superKoBanned = new Uint8Array(25);
    const koRecapBlocked = new Uint8Array(25);
    superKoBanned[4] = 1;
    koRecapBlocked[8] = 1;
    const encoded = encodeKataGoV7(emptyPosition({
      encorePhase: 1,
      superKoBanned,
      koRecapBlocked,
    }), metadata);
    expect(encoded.spatial[at(6, 4, 0)]).toBe(1);
    expect(encoded.spatial[at(7, 3, 1)]).toBe(1);
    expect(encoded.spatial[at(8, 3, 1)]).toBe(0);
  });

  it("requires exact area and ladder derivations instead of inventing them", () => {
    const noArea = emptyPosition({ areaOwners: undefined });
    expect(() => encodeKataGoV7(noArea, metadata)).toThrow(/area ownership/);
    expect(() => encodeKataGoV7(emptyPosition({
      ladderMasks: {
        current: new Uint8Array(1),
        previous: new Uint8Array(25),
        previousPrevious: new Uint8Array(25),
        opponentEscape: new Uint8Array(25),
      },
    }), metadata)).toThrow(/board entries/);
  });

  it("encodes area and second-encore starting-stone planes relative to the player", () => {
    const areaOwners = new Uint8Array(25);
    areaOwners[0] = 1;
    areaOwners[1] = 2;
    const board = new Uint8Array(25);
    board[2] = 2;
    const secondEncoreStartColors = new Uint8Array(25);
    secondEncoreStartColors[2] = 2;
    const encoded = encodeKataGoV7(emptyPosition({
      encorePhase: 2,
      board,
      recentBoards: [board, board, board],
      areaOwners,
      secondEncoreStartColors,
      rules: {
        koRule: "simple",
        scoringRule: "territory",
        taxRule: "none",
        multiStoneSuicideLegal: false,
      },
    }), metadata);
    expect(encoded.spatial[at(18, 0, 0)]).toBe(1);
    expect(encoded.spatial[at(19, 1, 0)]).toBe(1);
    expect(encoded.spatial[at(19, 2, 0)]).toBe(1);
    expect(encoded.global[13]).toBe(1);
  });

  it("enforces model version and optional InputMeta contract", () => {
    expect(() => encodeKataGoV7(emptyPosition(), {
      ...metadata,
      modelVersion: 15,
    })).toThrow(/requires modelVersion >= 16/);
    expect(() => encodeKataGoV7(emptyPosition(), {
      ...metadata,
      metaEncoderVersion: 1,
      numInputMetaChannels: 4,
    })).toThrow(/requires SGF metadata/);
    const meta = new Float32Array([1, 2, 3, 4]);
    expect(encodeKataGoV7(emptyPosition({ meta }), {
      ...metadata,
      metaEncoderVersion: 1,
      numInputMetaChannels: 4,
    }).meta).toEqual(meta);
  });

  it("hides history when requested and suppresses pass-end feature consistently", () => {
    const encoded = encodeKataGoV7(emptyPosition({
      moves: [{ player: "W", x: 1, y: 1 }],
      validTurnsThisPhase: 1,
      suppressHistory: true,
      passWouldEndPhase: true,
      suppressPassWouldEndPhase: true,
    }), metadata);
    expect(encoded.spatial[at(9, 1, 1)]).toBe(0);
    expect(encoded.global[14]).toBe(0);
  });
});
