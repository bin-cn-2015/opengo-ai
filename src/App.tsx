import { useMemo, useState } from "react";
import { applyAction, createGame, isGameOver, type GameState } from "../packages/go-engine/src";

const SIZE = 19;

export default function App() {
  const [game, setGame] = useState<GameState>(() => createGame(SIZE));
  const points = useMemo(() => Array.from({ length: SIZE }, (_, i) => i), []);
  const board = game.board;
  const finished = isGameOver(game);

  function reset() {
    setGame(createGame(SIZE));
  }

  function play(row: number, col: number) {
    const next = applyAction(game, { type: "play", row, col });
    if (next) setGame(next);
  }

  function pass() {
    const next = applyAction(game, { type: "pass" });
    if (next) setGame(next);
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
                return <button key={`${r}-${c}`} className="point" style={{ left: `${(c / 18) * 100}%`, top: `${(r / 18) * 100}%` }} onClick={() => play(r, c)} disabled={finished} aria-label={`Row ${r + 1}, column ${c + 1}`}>
                  {star && !stone && <span className="star" />}
                  {stone && <span className={`stone ${stone}`} />}
                </button>;
              }))}
            </div>
          </div>
          <div className="board-footer">
            <span>BLACK <b>{game.captures.black} captures</b></span>
            <span>WHITE <b>{game.captures.white} captures</b></span>
            <button onClick={pass} disabled={finished}>PASS</button>
            <button onClick={reset}>RESET GAME ↺</button>
          </div>
        </div>
        <aside className="side-panel">
          <div className="turn-card"><span className="eyebrow">{finished ? "GAME FINISHED" : "TO PLAY"}</span><div className="turn-line">{!finished && <span className={`turn-stone ${game.toMove}`} />}<strong>{finished ? "Two passes" : game.toMove === "black" ? "Black" : "White"}</strong></div><p>{finished ? "Both players passed. Scoring is the next milestone." : "Take your turn on the board."}</p></div>
          <div className="feature-card"><span className="eyebrow">PROJECT ROADMAP</span><ul><li className="done">Repository bootstrap</li><li className="done">Core board rules & passes</li><li className="active">Rule edge cases & scoring</li><li>PUCT / MCTS search</li><li>KataGo model adapter</li><li>WebGPU · WebGL · WASM</li><li>SGF review & analysis</li></ul></div>
          <div className="note">Pass and two-pass game termination are implemented. AI inference, scoring, SGF and full tournament-rule options are still in development.</div>
        </aside>
      </section>
      <footer><span>OPEN SOURCE, BUILT ONE MOVE AT A TIME.</span><a href="https://github.com/bin-cn-2015/opengo-ai">VIEW ON GITHUB ↗</a></footer>
    </main>
  );
}
