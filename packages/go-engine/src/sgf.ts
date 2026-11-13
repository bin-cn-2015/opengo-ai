import { applyAction, createGame, type GameState, type Stone } from "./index";

export interface SgfNode {
  properties: Record<string, string[]>;
  children: SgfNode[];
}
export interface SgfCollection { games: SgfNode[] }
export interface SgfReplay {
  initial: GameState;
  states: GameState[];
  moves: { color: Stone; row: number; col: number; comment?: string }[];
  root: SgfNode;
  metadata: { blackPlayer?: string; whitePlayer?: string; result?: string; rules?: string };
}

function parseValue(source: string, cursor: { i: number }): string {
  if (source[cursor.i] !== "[") throw new SyntaxError("Expected SGF property value.");
  cursor.i++;
  let value = "";
  while (cursor.i < source.length) {
    const ch = source[cursor.i++];
    if (ch === "]") return value;
    if (ch === "\\") {
      if (cursor.i >= source.length) break;
      const escaped = source[cursor.i++];
      if (escaped !== "\n" && escaped !== "\r") value += escaped;
      if (escaped === "\r" && source[cursor.i] === "\n") cursor.i++;
    } else value += ch;
  }
  throw new SyntaxError("Unterminated SGF property value.");
}

export function parseSgf(source: string): SgfCollection {
  let i = 0;
  const whitespace = () => { while (/\s/.test(source[i] ?? "") && i < source.length) i++; };
  function node(): SgfNode {
    if (source[i++] !== ";") throw new SyntaxError("Expected SGF node.");
    const properties: Record<string, string[]> = {};
    while (true) {
      whitespace();
      const match = /^[A-Z]+/.exec(source.slice(i));
      if (!match) break;
      const name = match[0]; i += name.length;
      whitespace();
      const values: string[] = [];
      while (source[i] === "[") { values.push(parseValue(source, { get i(){return i;}, set i(v){i=v;} })); whitespace(); }
      if (!values.length) throw new SyntaxError(`Property ${name} has no value.`);
      properties[name] = [...(properties[name] ?? []), ...values];
    }
    return { properties, children: [] };
  }
  function tree(): SgfNode {
    whitespace();
    if (source[i++] !== "(") throw new SyntaxError("Expected SGF game tree.");
    whitespace();
    if (source[i] !== ";") throw new SyntaxError("Game tree must start with a node.");
    const root = node();
    let tail = root;
    while (true) {
      whitespace();
      if (source[i] !== ";") break;
      const next = node(); tail.children.push(next); tail = next;
    }
    while (true) {
      whitespace();
      if (source[i] !== "(") break;
      tail.children.push(tree());
    }
    whitespace();
    if (source[i++] !== ")") throw new SyntaxError("Unclosed SGF game tree.");
    return root;
  }
  const games: SgfNode[] = [];
  whitespace();
  while (i < source.length) { games.push(tree()); whitespace(); }
  if (!games.length) throw new SyntaxError("No SGF game found.");
  return { games };
}

function escapeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/]/g, "\\]").replace(/\r\n|\r|\n/g, "\\n");
}
export function serializeSgf(collection: SgfCollection | SgfNode): string {
  const games = "games" in collection ? collection.games : [collection];
  const writeNode = (n: SgfNode): string => ";" + Object.entries(n.properties)
    .map(([key, values]) => key + values.map(v => "[" + escapeValue(v) + "]").join(""))
    .join("") + n.children.map(child => child.children.length ? "(" + writeNode(child) + child.children.map(writeNode).join("") + ")" : writeNode(child)).join("");
  return games.map(root => "(" + writeNode(root) + ")").join("");
}

const coord = (value: string, size: number): [number, number] => {
  if (value === "") return [-1, -1];
  if (!/^[a-s]{2}$/.test(value)) throw new SyntaxError("Invalid SGF coordinate.");
  const col = value.charCodeAt(0) - 97, row = value.charCodeAt(1) - 97;
  if (row >= size || col >= size) throw new SyntaxError("SGF coordinate is outside the board.");
  return [row, col];
};
const point = (row: number, col: number) => String.fromCharCode(97 + col, 97 + row);
const prop = (node: SgfNode, key: string) => node.properties[key]?.[0];

export function replaySgf(root: SgfNode): SgfReplay {
  if (prop(root, "GM") !== "1") throw new SyntaxError("Only Go SGF (GM[1]) is supported.");
  const size = Number(prop(root, "SZ") ?? 19);
  if (![9, 13, 19].includes(size)) throw new SyntaxError("Board size must be 9, 13, or 19.");
  const komi = Number(prop(root, "KM") ?? 7.5);
  if (!Number.isFinite(komi) || komi < 0) throw new SyntaxError("Invalid komi.");
  const rule = (prop(root, "RU") ?? "").toLowerCase();
  const scoringRule = /japanese|territory/.test(rule) ? "territory" : "area";
  let initial = createGame(size);
  const board = initial.board.map(row => [...row]);
  for (const [key, color] of [["AB", "black"], ["AW", "white"]] as const) {
    for (const value of root.properties[key] ?? []) {
      const [r,c] = coord(value,size);
      if (r < 0 || board[r][c] !== null) throw new SyntaxError("Invalid or overlapping setup stone.");
      board[r][c] = color;
    }
  }
  for (const value of root.properties.AE ?? []) {
    const [r,c] = coord(value,size);
    if (r < 0) throw new SyntaxError("Pass is not valid in setup stones.");
    board[r][c] = null;
  }
  const toMove: Stone = prop(root,"PL") === "W" ? "white" : "black";
  const key = board.map(row => row.map(v => v === "black" ? "b" : v === "white" ? "w" : ".").join("")).join("/");
  initial = { ...initial, board, toMove, komi, scoringRule, history: [key + (initial.koRule === "situational" ? " " + toMove : "")] };
  const states = [initial];
  const moves: SgfReplay["moves"] = [];
  let state = initial;
  let current: SgfNode | undefined = root;
  while (current) {
    if (current !== root) {
      const colorKey = current.properties.B ? "B" : current.properties.W ? "W" : null;
      if (colorKey) {
        const color = colorKey === "B" ? "black" : "white";
        if (state.toMove !== color) throw new SyntaxError("Move color conflicts with side to play.");
        const value = prop(current,colorKey)!;
        const [row,col] = coord(value,size);
        const next = applyAction(state, row < 0 ? {type:"pass"} : {type:"play",row,col});
        if (!next) throw new SyntaxError(`Illegal SGF move: ${value || "pass"}.`);
        state = next;
        moves.push({color,row,col,comment:prop(current,"C")});
        states.push(state);
      }
    }
    // Main line is the first child. Other branches remain preserved in root for re-export.
    current = current.children[0];
  }
  return { initial, states, moves, root, metadata: {
    blackPlayer: prop(root,"PB"), whitePlayer: prop(root,"PW"), result: prop(root,"RE"), rules: prop(root,"RU")
  }};
}

export function createSgfFromReplay(replay: SgfReplay, comments: (string | undefined)[] = []): string {
  const root = replay.root;
  const nodes: SgfNode[] = [];
  replay.moves.forEach((move, i) => {
    const properties: Record<string,string[]> = {};
    if (move.row < 0) properties[move.color === "black" ? "B" : "W"] = [""];
    else properties[move.color === "black" ? "B" : "W"] = [point(move.row,move.col)];
    const comment = comments[i] ?? move.comment;
    if (comment) properties.C = [comment];
    nodes.push({properties,children:[]});
  });
  const cleanRoot: SgfNode = {properties:{...root.properties},children:[]};
  let tail = cleanRoot;
  for (const n of nodes) { tail.children.push(n); tail = n; }
  return serializeSgf(cleanRoot);
}
