import { useMemo, useState } from "react";
import { createBoard, playMove, type Board, type Stone } from "../packages/go-engine/src";

const SIZE = 19;

export default function App() {
  const [board, setBoard] = useState<Board>(() => createBoard(SIZE));
  const [turn, setTurn] = useState<Stone>("black");
  const [moveCount, setMoveCount] = useState(0);
  const [captures, setCaptures] = useState({ black: 0, white: 0 });
  const points = useMemo(() => Array.from({ length: SIZE }, (_, i) => i), []);

  function reset() {
    setBoard(createBoard(SIZE));
    setTurn("black");
    setMoveCount(0);
    setCaptures({ black: 0, white: 0 });
  }

  function play(row: number, col: number) {
    const result = playMove(board, row, col, turn);
    if (!result) return;
    setBoard(result.board);
    setCaptures((old) => ({ ...old, [turn]: old[turn] + result.captured }));
    setTurn(turn === "black" ? "white" : "black");
    setMoveCount((n) => n + 1);
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
          <div className="panel-head"><div><span className="eyebrow">LIVE BOARD</span><h2>19 × 19</h2></div><span className="move-count">MOVE {String(moveCount).padStart(3, "0")}</span></div>
          <div className="board-wrap">
            <div className="board" role="grid" aria-label="Go board">
              {points.map((r) => points.map((c) => {
                const stone = board[r][c];
                const star = [3, 9, 15].includes(r) && [3, 9, 15].includes(c);
                return <button key={`${r}-${c}`} className="point" style={{ left: `${(c / 18) * 100}%`, top: `${(r / 18) * 100}%` }} onClick={() => play(r, c)} aria-label={`Row ${r + 1}, column ${c + 1}`}>
                  {star && !stone && <span className="star" />}
                  {stone && <span className={`stone ${stone}`} />}
                </button>;
              }))}
            </div>
          </div>
          <div className="board-footer"><span>BLACK <b>{captures.black} captures</b></span><span>WHITE <b>{captures.white} captures</b></span><button onClick={reset}>RESET GAME ↺</button></div>
        </div>
        <aside className="side-panel">
          <div className="turn-card"><span className="eyebrow">TO PLAY</span><div className="turn-line"><span className={`turn-stone ${turn}`} /><strong>{turn === "black" ? "Black" : "White"}</strong></div><p>Take your turn on the board.</p></div>
          <div className="feature-card"><span className="eyebrow">PROJECT ROADMAP</span><ul><li className="done">Repository bootstrap</li><li className="active">Go rules engine</li><li>PUCT / MCTS search</li><li>KataGo model adapter</li><li>WebGPU · WebGL · WASM</li><li>SGF review & analysis</li></ul></div>
          <div className="note">This is an early playable board. AI inference, ko/superko, pass, scoring and SGF are not implemented yet.</div>
        </aside>
      </section>
      <footer><span>OPEN SOURCE, BUILT ONE MOVE AT A TIME.</span><a href="https://github.com/bin-cn-2015/opengo-ai">VIEW ON GITHUB ↗</a></footer>
    </main>
  );
}
