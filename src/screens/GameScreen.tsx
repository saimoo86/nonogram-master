import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Board, type Feedback, type Pos, type Tool } from '../components/Board';
import { PixelArt } from '../components/PixelArt';
import { Modal } from '../components/ui';
import { CATALOG, getPuzzleData, sceneOf, toPuzzle } from '../data/catalog';
import { hintCandidates, reduceGame, restoreGame, serializeGame } from '../engine/board';
import { formatTime } from '../engine/dates';
import { useNav } from '../nav';
import { adsActive, ads } from '../services/ads';
import { playSfx } from '../services/audio';
import { vibrate } from '../services/haptics';
import { useStore } from '../store/Store';
import { ACHIEVEMENTS, levelInfo, unlockedScenes } from '../store/progression';
import type { CompletionResult } from '../store/types';
import type { TranslationKey } from '../i18n';

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];

interface ResultInfo extends CompletionResult {
  time: number;
  hints: number;
  mistakes: number;
  newBest: boolean;
  newArt: boolean;
}

export function GameScreen({ puzzleId }: { puzzleId: string }) {
  const data = useMemo(() => getPuzzleData(puzzleId), [puzzleId]);
  if (!data) return <GameError />;
  return <GameInner key={puzzleId} puzzleId={puzzleId} />;
}

function GameError() {
  const { t } = useStore();
  const { back } = useNav();
  return (
    <div className="screen center">
      <p>{t('game.loadError')}</p>
      <button className="btn" onClick={back}>
        {t('common.back')}
      </button>
    </div>
  );
}

function GameInner({ puzzleId }: { puzzleId: string }) {
  const store = useStore();
  const { t, save } = store;
  const nav = useNav();
  const data = useMemo(() => getPuzzleData(puzzleId)!, [puzzleId]);
  const puzzle = useMemo(() => toPuzzle(data), [data]);
  const dailyKey = puzzleId.startsWith('daily-') ? puzzleId.slice(6) : undefined;

  const [state, dispatch] = useReducer(reduceGame, null, () => restoreGame(puzzleId, puzzle.solution, save.inProgress[puzzleId]));
  const [tool, setTool] = useState<Tool>('fill');
  const [zoom, setZoom] = useState(1);
  const [cursor, setCursor] = useState<Pos | null>(null);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [result, setResult] = useState<ResultInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const doneHandled = useRef(false);

  // ---- timer (ignores time while the tab is hidden) ----
  useEffect(() => {
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const d = now - last;
      last = now;
      if (document.hidden || stateRef.current.done) return;
      dispatch({ type: 'tick', ms: Math.min(d, 1500) });
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // ---- autosave ----
  const reported = useRef({ time: state.elapsed, moves: state.moves, correct: state.correctMoves });
  const flush = useCallback(() => {
    const s = stateRef.current;
    if (doneHandled.current) return;
    const untouched = s.moves === 0 && s.hints === 0 && s.cells.every((c) => c === 0) && s.elapsed === 0;
    const rep = reported.current;
    const delta = { time: s.elapsed - rep.time, moves: s.moves - rep.moves, correct: s.correctMoves - rep.correct };
    reported.current = { time: s.elapsed, moves: s.moves, correct: s.correctMoves };
    if (untouched) return;
    store.recordProgress(puzzleId, serializeGame(s), delta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzleId]);

  useEffect(() => {
    const t1 = window.setTimeout(flush, 350);
    return () => window.clearTimeout(t1);
  }, [state.cells, state.hints, flush]);
  useEffect(() => {
    const id = window.setInterval(flush, 5000);
    const onHide = () => document.hidden && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  // ---- completion ----
  useEffect(() => {
    if (!state.done || doneHandled.current) return;
    doneHandled.current = true;
    const s = stateRef.current;
    // record final stats delta, then complete
    const rep = reported.current;
    store.recordProgress(puzzleId, serializeGame(s), { time: s.elapsed - rep.time, moves: s.moves - rep.moves, correct: s.correctMoves - rep.correct });
    const key = dailyKey ? `daily-${dailyKey}` : puzzleId;
    const prev = save.completed[key];
    const hadScene = data.sceneId in unlockedScenes(save);
    const res = store.completePuzzle({ puzzleId, difficulty: data.difficulty, dailyKey, time: s.elapsed, hints: s.hints, mistakes: s.mistakes });
    playSfx('complete');
    vibrate([40, 40, 80]);
    const show = () =>
      setResult({
        ...res,
        time: s.elapsed,
        hints: s.hints,
        mistakes: s.mistakes,
        newBest: !prev || s.elapsed < prev.best,
        newArt: !dailyKey && !hadScene,
      });
    if (adsActive(save)) void ads.showInterstitial('puzzle_complete').then(show, show);
    else window.setTimeout(show, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.done]);

  // ---- feedback ----
  const lastSfx = useRef(0);
  const onFeedback = useCallback((k: Feedback) => {
    const now = performance.now();
    if (now - lastSfx.current > 45) {
      playSfx(k === 'fill' ? 'fill' : k === 'x' ? 'x' : 'erase');
      lastSfx.current = now;
    }
    vibrate(6);
  }, []);
  const prevMistakes = useRef(state.mistakes);
  useEffect(() => {
    if (state.mistakes > prevMistakes.current) {
      playSfx('error');
      vibrate(35);
    }
    prevMistakes.current = state.mistakes;
  }, [state.mistakes]);

  // ---- actions ----
  const doHint = useCallback(() => {
    const s = stateRef.current;
    if (s.done) return;
    const cand = hintCandidates(s);
    if (!cand.length) return;
    if (!store.spendHint()) {
      setNotice(t('game.noHints'));
      return;
    }
    const i = cand[Math.floor(Math.random() * cand.length)];
    dispatch({ type: 'hint', i });
    setCursor({ r: Math.floor(i / s.size), c: i % s.size });
    playSfx('hint');
    vibrate(15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  const watchAd = async () => {
    const r = await ads.showRewarded('extra_hints');
    if (r.rewarded) {
      store.grantHints(3);
      setNotice(null);
    }
  };

  const cycleTool = useCallback(() => setTool((x) => (x === 'fill' ? 'x' : 'fill')), []);
  const zoomBy = (d: number) =>
    setZoom((z) => {
      const i = Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + d));
      if (i === 0) setTool((tl) => (tl === 'pan' ? 'fill' : tl));
      return ZOOMS[i];
    });

  // ---- keyboard ----
  useEffect(() => {
    const N = puzzle.size;
    const onKey = (e: KeyboardEvent) => {
      if (result || confirmRestart) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA')) return;
      const key = e.key.toLowerCase();
      const move = (dr: number, dc: number) => {
        e.preventDefault();
        setCursor((c) => {
          const p = c ?? { r: 0, c: 0 };
          return { r: Math.max(0, Math.min(N - 1, p.r + dr)), c: Math.max(0, Math.min(N - 1, p.c + dc)) };
        });
      };
      const paintAt = (target: 1 | 2) => {
        const p = cursor ?? { r: 0, c: 0 };
        const i = p.r * N + p.c;
        const cur = stateRef.current.cells[i];
        dispatch({ type: 'paint', i, value: cur === target ? 0 : target });
        if (!cursor) setCursor(p);
        onFeedback(cur === target ? 'erase' : target === 1 ? 'fill' : 'x');
      };
      if (key === 'arrowup') move(-1, 0);
      else if (key === 'arrowdown') move(1, 0);
      else if (key === 'arrowleft') move(0, -1);
      else if (key === 'arrowright') move(0, 1);
      else if (key === ' ' || key === 'enter') { e.preventDefault(); paintAt(tool === 'x' ? 2 : 1); }
      else if (key === 'x') paintAt(2);
      else if (key === 'f') paintAt(1);
      else if ((key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) || key === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); }
      else if (key === 'z') { e.preventDefault(); dispatch({ type: 'undo' }); }
      else if (key === 'h') doHint();
      else if (key === 'm') cycleTool();
      else if (key === '+' || key === '=') zoomBy(1);
      else if (key === '-') zoomBy(-1);
      else if (key === 'escape') nav.back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, tool, result, confirmRestart, doHint, cycleTool, puzzle.size, onFeedback]);

  const title = dailyKey
    ? `${t('menu.daily')}`
    : `${t(`diff.${data.difficulty}` as TranslationKey)} · ${data.size}×${data.size}`;

  const nextPuzzle = useMemo(() => {
    if (dailyKey) return null;
    const tier = CATALOG.filter((p) => p.difficulty === data.difficulty);
    const idx = tier.findIndex((p) => p.id === puzzleId);
    const ordered = [...tier.slice(idx + 1), ...tier.slice(0, idx)];
    return ordered.find((p) => !store.save.completed[p.id]) ?? ordered[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, puzzleId]);

  const modeLabel = tool === 'fill' ? t('game.modeFillOn') : tool === 'x' ? t('game.modeXOn') : t('game.modePanOn');
  const filledTotal = puzzle.solution.flat().filter(Boolean).length;
  const filledNow = state.cells.filter((c) => c === 1).length;

  return (
    <div className="screen game" data-testid="game-screen">
      <header className="game-header">
        <button className="icon-btn" onClick={nav.back} aria-label={t('common.back')} data-testid="back">
          ‹
        </button>
        <div className="game-title">
          <b>{title}</b>
          <span className="sub" data-testid="progress-count">{filledNow}/{filledTotal}</span>
        </div>
        <div className="chip timer" data-testid="timer" aria-label="timer">
          ⏱ {formatTime(state.elapsed)}
        </div>
        <div className="chip hints" data-testid="hint-count" title={t('game.hint')}>
          💡 {save.hints}
        </div>
      </header>

      <div className={`mode-banner m-${tool}`} data-testid="mode-banner" role="status">
        <span className="dot" />
        {modeLabel}
        {state.mistakes > 0 && <em>{t('game.mistakes')}: {state.mistakes}</em>}
      </div>

      <Board
        rowClues={puzzle.rowClues}
        colClues={puzzle.colClues}
        state={state}
        showMistakes={save.settings.showMistakes}
        tool={tool}
        zoom={zoom}
        cursor={cursor}
        onCursor={setCursor}
        dispatch={dispatch}
        onFeedback={onFeedback}
      />

      {notice && (
        <div className="notice" role="alert" data-testid="notice" onClick={() => setNotice(null)}>
          {notice}
          {adsActive(save) && (
            <button className="btn small" onClick={watchAd}>
              {t('game.watchAd')}
            </button>
          )}
        </div>
      )}

      <div className="toolbar" role="toolbar">
        <div className="seg" role="group" aria-label={t('game.mode')}>
          <button className={tool === 'fill' ? 'on' : ''} onClick={() => setTool('fill')} data-testid="tool-fill" aria-pressed={tool === 'fill'}>
            <span className="glyph sq" />
            <small>{t('game.fill')}</small>
          </button>
          <button className={tool === 'x' ? 'on' : ''} onClick={() => setTool('x')} data-testid="tool-x" aria-pressed={tool === 'x'}>
            <span className="glyph">✕</span>
            <small>{t('game.x')}</small>
          </button>
          <button className={tool === 'pan' ? 'on' : ''} onClick={() => setTool('pan')} disabled={zoom === 1} data-testid="tool-pan" aria-pressed={tool === 'pan'}>
            <span className="glyph">✥</span>
            <small>{t('game.pan')}</small>
          </button>
        </div>
        <div className="tool-group">
          <button className="tbtn" onClick={() => dispatch({ type: 'undo' })} disabled={!state.undo.length} data-testid="undo" aria-label={t('game.undo')}>
            ↶<small>{t('game.undo')}</small>
          </button>
          <button className="tbtn" onClick={() => dispatch({ type: 'redo' })} disabled={!state.redo.length} data-testid="redo" aria-label={t('game.redo')}>
            ↷<small>{t('game.redo')}</small>
          </button>
          <button className="tbtn accent" onClick={doHint} data-testid="hint" aria-label={t('game.hint')}>
            💡<small>{t('game.hint')}</small>
          </button>
          <button className="tbtn" onClick={() => setConfirmRestart(true)} data-testid="restart" aria-label={t('game.restart')}>
            ⟲<small>{t('game.restart')}</small>
          </button>
        </div>
        <div className="tool-group zoomers">
          <button className="tbtn" onClick={() => zoomBy(-1)} disabled={zoom === ZOOMS[0]} data-testid="zoom-out" aria-label={t('game.zoomOut')}>
            −<small>{t('game.zoomOut')}</small>
          </button>
          <button className="tbtn" onClick={() => zoomBy(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} data-testid="zoom-in" aria-label={t('game.zoomIn')}>
            +<small>{t('game.zoomIn')}</small>
          </button>
        </div>
      </div>
      <p className="keys-hint">{t('game.keys')}</p>

      {confirmRestart && (
        <Modal onClose={() => setConfirmRestart(false)} label={t('game.restartTitle')}>
          <h2>{t('game.restartTitle')}</h2>
          <p>{t('game.restartBody')}</p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setConfirmRestart(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn danger"
              data-testid="confirm-restart"
              onClick={() => {
                dispatch({ type: 'restart' });
                store.clearProgress(puzzleId);
                reported.current = { time: 0, moves: 0, correct: 0 };
                setConfirmRestart(false);
                setCursor(null);
              }}
            >
              {t('game.restart')}
            </button>
          </div>
        </Modal>
      )}

      {result && (
        <ResultModal
          result={result}
          data={data}
          onNext={nextPuzzle ? () => nav.replace({ name: 'game', puzzleId: nextPuzzle.id }) : null}
          onMenu={() => nav.back()}
          onCollection={() => nav.replace({ name: 'collection' })}
        />
      )}
    </div>
  );
}

function ResultModal({
  result,
  data,
  onNext,
  onMenu,
  onCollection,
}: {
  result: ResultInfo;
  data: NonNullable<ReturnType<typeof getPuzzleData>>;
  onNext: (() => void) | null;
  onMenu: () => void;
  onCollection: () => void;
}) {
  const { t, lang } = useStore();
  const li = levelInfo(result.save.xp);
  const scene = sceneOf(data.sceneId);
  const name = scene ? scene.name[lang as 'en' | 'ko'] ?? scene.name.en : t('menu.daily');
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setPct(Math.min(100, (li.into / li.need) * 100)), 150);
    return () => window.clearTimeout(id);
  }, [li.into, li.need]);
  return (
    <Modal label={t('result.title')}>
      <div className="result" data-testid="result-modal">
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 90}ms`, ['--h' as string]: `${(i * 47) % 360}` }} />
          ))}
        </div>
        <h2>{t('result.title')}</h2>
        <div className="result-art">
          <PixelArt data={data} size={132} label={name} />
        </div>
        <p className="art-name">{name}</p>
        {result.newArt && <p className="tag new" data-testid="new-art">✨ {t('result.newArt')}</p>}
        <div className="result-stats">
          <div>
            <span>{t('result.time')}</span>
            <b data-testid="result-time">{formatTime(result.time)}</b>
            {result.newBest && <em className="tag">{t('result.newBest')}</em>}
          </div>
          <div>
            <span>XP</span>
            <b data-testid="result-xp">{t('result.xp', { n: result.xpGained })}</b>
          </div>
          <div>
            <span>{t('common.level', { n: li.level })}</span>
            <b>{result.hintsGained > 0 ? t('result.hintsEarned', { n: result.hintsGained }) : '—'}</b>
          </div>
        </div>
        <div className="xpbar big">
          <i style={{ width: `${pct}%` }} />
        </div>
        {result.levelAfter > result.levelBefore && <p className="tag new" data-testid="level-up">⬆ {t('result.levelUp', { n: result.levelAfter })}</p>}
        <div className="tags">
          {result.hints === 0 && <span className="tag">💡 {t('result.noHint')}</span>}
          {result.mistakes === 0 && <span className="tag">🎯 {t('result.perfect')}</span>}
        </div>
        {result.newAchievements.map((id) => {
          const a = ACHIEVEMENTS.find((x) => x.id === id)!;
          return (
            <div className="ach-line" key={id}>
              {a.icon} <b>{t(`ach.${id}.name` as TranslationKey)}</b>
            </div>
          );
        })}
        {!result.firstTime && <p className="muted">{t('result.replay')}</p>}
        <div className="modal-actions stack">
          {onNext && (
            <button className="btn primary" onClick={onNext} data-testid="next-puzzle">
              {t('result.next')}
            </button>
          )}
          {result.newArt && (
            <button className="btn" onClick={onCollection}>
              {t('result.collection')}
            </button>
          )}
          <button className="btn ghost" onClick={onMenu} data-testid="result-menu">
            {t('result.menu')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

