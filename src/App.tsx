import { useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { applyAction, calculateScore, createGame, getTerritory, isGameOver, setScoringConfig, toggleDeadGroup, type GameState, type ScoringRule, type Stone } from "../packages/go-engine/src";
import { parseSgf, replaySgf, serializeSgf, type SgfNode } from "../packages/go-engine/src/sgf";

const SIZE = 19;

export default function App() {
  const [game, setGame] = useState<GameState>(() => createGame(SIZE));
  const [sgfRoot, setSgfRoot] = useState<SgfNode | null>(null);
  const [reviewStates, setReviewStates] = useState<GameState[] | null>(null);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [moveLog, setMoveLog] = useState<{ color: Stone; row: number; col: number }[]>([]);
  const [sgfMessage, setSgfMessage] = useState("");
  const points = useMemo(() => Array.from({ length: SIZE }, (_, i) => i), []);
  const board = game.board;
  const finished = isGameOver(game);
  const territory = useMemo(() => getTerritory(game.board, game.deadStones), [game.board, game.deadStones]);
  const score = finished ? calculateScore(game) : null;

  function reset() {
    setGame(createGame(SIZE));
    setSgfRoot(null); setReviewStates(null); setReviewIndex(0); setMoveLog([]); setSgfMessage("");
  }

  function importSgf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((source) => {
      const replay = replaySgf(parseSgf(source).games[0]);
      setGame(replay.initial); setSgfRoot(replay.root);
      setReviewStates(replay.states); setReviewIndex(0);
      setMoveLog(replay.moves.map(({color,row,col}) => ({color,row,col})));
      setSgfMessage("Loaded " + replay.moves.length + " moves · " + replay.initial.board.length + "×" + replay.initial.board.length);
    }).catch((error: unknown) => {
      setSgfMessage(error instanceof Error ? error.message : "Unable to read SGF file.");
    });
    event.target.value = "";
  }

  function exportSgf() {
    if (sgfRoot) {\n      const importedBlob = new Blob([serializeSgf(sgfRoot)], { type: "application/x-go-sgf;charset=utf-8" });\n      const importedUrl = URL.createObjectURL(importedBlob);\n      const importedLink = document.createElement("a"); importedLink.href = importedUrl; importedLink.download = "opengo-game.sgf"; importedLink.click();\n      URL.revokeObjectURL(importedUrl); setSgfMessage("SGF exported."); return;\n    }\n    const root: SgfNode = { properties: {
      GM: ["1"], FF: ["4"], CA: ["UTF-8"], SZ: [String(game.board.length)],
      KM: [String(game.komi)], RU: [game.scoringRule === "territory" ? "Japanese" : "Chinese"]
    }, children: [] };
    const nodes: SgfNode[] = moveLog.map((move) => ({
      properties: { [move.color === "black" ? "B" : "W"]: [move.row < 0 ? "" : String.fromCharCode(97 + move.col, 97 + move.row)] },
      children: []
    }));
    const exportRoot: SgfNode = { properties: { ...root.properties }, children: [] };
    let tail = exportRoot;
    for (const node of nodes) { tail.children.push(node); tail = node; }
    const blob = new Blob([serializeSgf(exportRoot)], { type: "application/x-go-sgf;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "opengo-game.sgf"; link.click();
    URL.revokeObjectURL(url);
    setSgfMessage("SGF exported.");
  }

  function stepReview(delta: number) {
    if (!reviewStates) return;
    const next = Math.max(0, Math.min(reviewStates.length - 1, reviewIndex + delta));
    setReviewIndex(next); setGame(reviewStates[next]);
  }

  function play(row: number, col: number) {
    if (finished) { setGame(toggleDeadGroup(game, row, col)); return; }
    const next = applyAction(game, { type: "play", row, col });
    if (next) {
      setGame(next);
      setMoveLog((moves) => [...moves.slice(0, reviewIndex), { color: game.toMove, row, col }]);
      setReviewStates(null); setSgfRoot(null); setReviewIndex(0);
    }
  }

  function configureScoring(rule: ScoringRule, komi: number) {
    setGame(setScoringConfig(game, rule, komi));
  }

  function pass() {
    const next = applyAction(game, { type: "pass" });
    if (next) {
      setGame(next);
      setMoveLog((moves) => [...moves.slice(0, reviewIndex), { color: game.toMove, row: -1, col: -1 }]);
      setReviewStates(null); setSgfRoot(null); setReviewIndex(0);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">碁</span> OpenGo AI</a>
        <span className="status"><i /> EARLY DEVELOPMENT</span>
      </header>
      <section className="intro">
        <p className="eyebrow">OPEN-SOURCE · BROWSER-FIRST · GO ENGINE</p>
        <h1>Think in stones.<br /><em>Play without limits.</em></h1>
        <p className="subtitle">A new open-source Go AI, built for the browser and powered by KataGo's pretrained neural networks.</p>
      </section>
      <section className="workspace">
        <div className="board-panel">
          <div className="panel-head"><div><span className="eyebrow">LIVE BOARD</span><h2>19 × 19</h2></div><span className="move-count">MOVE {String(game.moveNumber).padStart(3, "0")}</span></div>
          <div className="board-wrap">
            <div className="board" role="grid" aria-label="Go board">
              {points.map((r) => points.map((c) => {
                const stone = board[r][c];
                const star = [3, 9, 15].includes(r) && [3, 9, 15].includes(c);
                return <button key={`${r}-${c}`} className="point" style={{ left: `${(c / 18) * 100}%`, top: `${(r / 18) * 100}%` }} onClick={() => play(r, c)} aria-label={`Row ${r + 1}, column ${c + 1}`}>
                  {star && !stone && <span className="star" />}
                  {stone && <span className={"stone " + stone + (game.deadStones.includes(r + "," + c) ? " dead" : "")} />}
                  {!stone && finished && territory.owners[r][c] && <span className={"territory " + territory.owners[r][c]} />}
                </button>;
              }))}
            </div>
          </div>
          <div className="board-footer">
            <span>BLACK <b>{game.captures.black} captures</b></span>
            <span>WHITE <b>{game.captures.white} captures</b></span>
            <button onClick={pass} disabled={finished || !!reviewStates}>PASS</button>
            <button onClick={reset}>RESET GAME ↺</button>
          </div>
        </div>
        <aside className="side-panel">
          <div className="turn-card"><span className="eyebrow">{finished ? "GAME FINISHED" : "TO PLAY"}</span><div className="turn-line">{!finished && <span className={`turn-stone ${game.toMove}`} />}<strong>{finished ? "Two passes" : game.toMove === "black" ? "Black" : "White"}</strong></div><p>{finished ? "Both players passed. Scoring is the next milestone." : "Take your turn on the board."}</p></div>
          <div className="feature-card"><span className="eyebrow">PROJECT ROADMAP</span><ul><li className="done">Repository bootstrap</li><li className="done">Core board rules & passes</li><li className="active">Rule edge cases & scoring</li><li>PUCT / MCTS search</li><li>KataGo model adapter</li><li>WebGPU · WebGL · WASM</li><li className="done">SGF import · export · replay</li></ul></div>
          <div className="feature-card sgf-card">
            <span className="eyebrow">SGF · GAME RECORD</span>
            <label className="sgf-import">IMPORT SGF<input type="file" accept=".sgf,application/x-go-sgf,text/plain" onChange={importSgf} /></label>
            <button className="sgf-export" onClick={exportSgf}>EXPORT SGF ↓</button>
            <div className="review-controls">
              <button onClick={() => stepReview(-1)} disabled={!reviewStates || reviewIndex === 0}>← BACK</button>
              <span>{reviewStates ? reviewIndex + " / " + (reviewStates.length - 1) : "LIVE GAME"}</span>
              <button onClick={() => stepReview(1)} disabled={!reviewStates || reviewIndex >= reviewStates.length - 1}>NEXT →</button>
            </div>
            {sgfMessage && <p className="sgf-message">{sgfMessage}</p>}
          </div>
          <div className="feature-card scoring-card">
            <span className="eyebrow">SCORING SETTINGS</span>
            <label>Rule<select value={game.scoringRule} onChange={(e) => configureScoring(e.target.value as ScoringRule, game.komi)}><option value="area">Chinese · Area</option><option value="territory">Japanese · Territory</option></select></label>
            <label>Komi<input type="number" min="0" max="100" step="0.5" value={game.komi} onChange={(e) => configureScoring(game.scoringRule, Number(e.target.value))} /></label>
            {finished && score && <div className="score-result"><span className="eyebrow">FINAL SCORE</span><strong>{score.winner === "draw" ? "Draw" : (score.winner === "black" ? "Black" : "White") + " wins"}</strong><p>Black {score.black.toFixed(1)} — White {score.white.toFixed(1)}</p><p>Territory B/W: {score.territory.black}/{score.territory.white} · Neutral: {score.territory.neutral}</p><p>Prisoners B/W: {score.prisoners.black}/{score.prisoners.white}</p><small>Tap a stone to mark or unmark its whole chain as dead.</small></div>}
          </div>
          <div className="note">{finished ? "Scoring is provisional until both players agree on dead groups." : "After two passes, mark agreed dead groups and review the provisional score."}</div>
        </aside>
      </section>
      <footer><span>OPEN SOURCE, BUILT ONE MOVE AT A TIME.</span><a href="https://github.com/bin-cn-2015/opengo-ai">VIEW ON GITHUB ↗</a></footer>
    </main>
  );
}
