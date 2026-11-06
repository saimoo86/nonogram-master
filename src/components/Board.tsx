import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { isCellWrong, type GameAction, type GameState } from '../engine/board';
import { lineClue } from '../engine/clues';
import type { CellState } from '../engine/types';

export type Tool = 'fill' | 'x' | 'pan';
export type Feedback = 'fill' | 'x' | 'erase';
export interface Pos {
  r: number;
  c: number;
}

interface Props {
  rowClues: number[][];
  colClues: number[][];
  state: GameState;
  showMistakes: boolean;
  tool: Tool;
  zoom: number;
  cursor: Pos | null;
  onCursor: (p: Pos | null) => void;
  dispatch: (a: GameAction) => void;
  onFeedback: (k: Feedback) => void;
}

interface CellProps {
  v: CellState;
  wrong: boolean;
  hl: boolean;
  gr: boolean;
  gb: boolean;
  hinted: boolean;
}

const Cell = memo(function Cell({ v, wrong, hl, gr, gb, hinted }: CellProps) {
  let cls = 'cell';
  if (v === 1) cls += ' f';
  else if (v === 2) cls += ' x';
  if (wrong) cls += ' wrong';
  if (hl) cls += ' hl';
  if (gr) cls += ' gr';
  if (gb) cls += ' gb';
  if (hinted) cls += ' hinted';
  return <div className={cls} />;
});

export function Board({ rowClues, colClues, state, showMistakes, tool, zoom, cursor, onCursor, dispatch, onFeedback }: Props) {
  const N = state.size;
  const wrapRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 320, h: 400 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics = useMemo(() => {
    const rowUnits = Math.max(1, ...rowClues.map((c) => (c.length ? c.reduce((a, v) => a + String(v).length * 0.62 + 0.5, 0) : 1)));
    const colLen = Math.max(1, ...colClues.map((c) => c.length || 1));
    const ff = 0.56;
    const availW = Math.max(120, box.w - 12);
    const availH = Math.max(120, box.h - 12);
    let cell = Math.min((availW - 8) / (N + rowUnits * ff), (availH - 8) / (N + colLen * ff * 1.32));
    cell = Math.max(9, Math.min(64, Math.floor(cell)));
    cell = Math.round(cell * zoom);
    const font = Math.max(9, Math.round(cell * ff));
    const maxColDigits = Math.max(1, ...colClues.flat().map((n) => String(n).length));
    const colFont = Math.max(7, Math.min(font, Math.floor((cell * 0.9) / (0.6 * maxColDigits))));
    return { cell, font, colFont, clueW: Math.ceil(rowUnits * font + 12), clueH: Math.ceil(colLen * font * 1.32 + 8) };
  }, [rowClues, colClues, box, N, zoom]);
  const { cell, font, colFont, clueW, clueH } = metrics;

  const stateRef = useRef(state);
  stateRef.current = state;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const cellRef = useRef(cell);
  cellRef.current = cell;

  // active drag stroke
  const stroke = useRef<{
    active: boolean;
    target: CellState;
    src: CellState;
    start: Pos;
    last: Pos;
    axis: 'h' | 'v' | null;
    kind: Feedback;
  } | null>(null);

  const posFromEvent = (e: RPointerEvent): Pos => {
    const rect = cellsRef.current!.getBoundingClientRect();
    const cs = cellRef.current;
    const c = Math.max(0, Math.min(N - 1, Math.floor((e.clientX - rect.left) / cs)));
    const r = Math.max(0, Math.min(N - 1, Math.floor((e.clientY - rect.top) / cs)));
    return { r, c };
  };

  const applyAt = (p: Pos, first: boolean) => {
    const st = stroke.current!;
    const idx = p.r * N + p.c;
    const cur = stateRef.current.cells[idx];
    if (stateRef.current.locked[idx]) return;
    if (!first) {
      if (st.target === 0) {
        if (cur !== st.src) return; // only erase the same kind we started on
      } else if (cur !== 0) return; // only paint over empty cells while dragging
    }
    if (cur === st.target) return;
    dispatch({ type: 'paint', i: idx, value: st.target });
    onFeedback(st.target === 0 ? 'erase' : st.target === 1 ? 'fill' : 'x');
  };

  const onDown = (e: RPointerEvent) => {
    if (toolRef.current === 'pan' || stateRef.current.done) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    const p = posFromEvent(e);
    onCursor(p);
    const idx = p.r * N + p.c;
    const cur = stateRef.current.cells[idx];
    const useX = e.button === 2 || toolRef.current === 'x';
    const target: CellState = useX ? (cur === 2 ? 0 : 2) : cur === 1 ? 0 : 1;
    stroke.current = { active: true, target, src: cur, start: p, last: p, axis: null, kind: useX ? 'x' : 'fill' };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* ignore */ }
    dispatch({ type: 'strokeStart' });
    applyAt(p, true);
  };

  const onMove = (e: RPointerEvent) => {
    const st = stroke.current;
    let p = posFromEvent(e);
    if (!st || !st.active) {
      if (e.pointerType === 'mouse') onCursor(p);
      return;
    }
    // lock the stroke to a single row or column once the pointer leaves the start cell
    if (!st.axis && (p.r !== st.start.r || p.c !== st.start.c)) {
      st.axis = Math.abs(p.r - st.start.r) >= Math.abs(p.c - st.start.c) ? 'v' : 'h';
    }
    if (st.axis === 'v') p = { r: p.r, c: st.start.c };
    else if (st.axis === 'h') p = { r: st.start.r, c: p.c };
    if (p.r === st.last.r && p.c === st.last.c) return;
    // interpolate so fast drags never skip cells
    const dr = Math.sign(p.r - st.last.r);
    const dc = Math.sign(p.c - st.last.c);
    let { r, c } = st.last;
    while (r !== p.r || c !== p.c) {
      if (r !== p.r) r += dr;
      if (c !== p.c) c += dc;
      applyAt({ r, c }, false);
    }
    st.last = p;
    onCursor(p);
  };

  const onUp = () => {
    if (stroke.current?.active) {
      stroke.current.active = false;
      dispatch({ type: 'strokeEnd' });
    }
  };

  // row / column completion (filled cells match clue) — greys out satisfied clues
  const rowDone = useMemo(
    () =>
      rowClues.map((clue, r) => {
        const line = state.cells.slice(r * N, r * N + N).map((v) => v === 1);
        return JSON.stringify(lineClue(line)) === JSON.stringify(clue);
      }),
    [state.cells, rowClues, N],
  );
  const colDone = useMemo(
    () =>
      colClues.map((clue, c) => {
        const line: boolean[] = [];
        for (let r = 0; r < N; r++) line.push(state.cells[r * N + c] === 1);
        return JSON.stringify(lineClue(line)) === JSON.stringify(clue);
      }),
    [state.cells, colClues, N],
  );

  const cells: JSX.Element[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      cells.push(
        <Cell
          key={i}
          v={state.cells[i]}
          wrong={showMistakes && isCellWrong(state, i)}
          hl={!!cursor && (cursor.r === r || cursor.c === c)}
          gr={c % 5 === 4 && c < N - 1}
          gb={r % 5 === 4 && r < N - 1}
          hinted={state.locked[i]}
        />,
      );
    }
  }

  return (
    <div className="board-wrap" ref={wrapRef} data-testid="board-wrap">
      <div className="nb" style={{ width: clueW + N * cell, ['--cell' as string]: `${cell}px`, ['--cfont' as string]: `${font}px`, ['--colfont' as string]: `${colFont}px` }} data-testid="board" data-size={N}>
        <div className="nb-top" style={{ height: clueH, marginLeft: clueW, gridTemplateColumns: `repeat(${N}, ${cell}px)` }}>
          {colClues.map((clue, c) => (
            <div key={c} className={`clue col${colDone[c] ? ' done' : ''}${cursor?.c === c ? ' hl' : ''}${c % 5 === 4 && c < N - 1 ? ' gr' : ''}`} data-testid="col-clue">
              {(clue.length ? clue : [0]).map((n, k) => (
                <span key={k}>{n}</span>
              ))}
            </div>
          ))}
        </div>
        <div className="nb-main">
          <div className="nb-rows" style={{ width: clueW }}>
            {rowClues.map((clue, r) => (
              <div key={r} className={`clue row${rowDone[r] ? ' done' : ''}${cursor?.r === r ? ' hl' : ''}${r % 5 === 4 && r < N - 1 ? ' gb' : ''}`} style={{ height: cell }} data-testid="row-clue">
                {(clue.length ? clue : [0]).map((n, k) => (
                  <span key={k}>{n}</span>
                ))}
              </div>
            ))}
          </div>
          <div
            className="nb-cells"
            ref={cellsRef}
            data-testid="cells"
            style={{ gridTemplateColumns: `repeat(${N}, ${cell}px)`, gridAutoRows: `${cell}px`, width: N * cell, touchAction: tool === 'pan' ? 'auto' : 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onLostPointerCapture={onUp}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse' && !stroke.current?.active) onCursor(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {cells}
          </div>
        </div>
      </div>
    </div>
  );
}
