import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SavedProgress } from '../engine/board';
import { localDateKey } from '../engine/dates';
import { translate, type Params, type TranslationKey } from '../i18n';
import { playSfx, setMusicEnabled, setSfxEnabled } from '../services/audio';
import { setVibrationEnabled } from '../services/haptics';
import { applyCompletion, defaultSave } from './progression';
import { detectDefaults, loadSave, persist, STORAGE_KEY } from './storage';
import type { CompletionEvent, CompletionResult, SaveData, Settings } from './types';

export interface AchievementToast {
  id: number;
  achievementId: string;
}

export interface StoreApi {
  save: SaveData;
  lang: string;
  t: (key: TranslationKey, params?: Params) => string;
  setSettings: (patch: Partial<Settings>) => void;
  /** Spend one hint from the inventory. Returns false when none left. */
  spendHint: () => boolean;
  grantHints: (n: number) => void;
  recordProgress: (puzzleId: string, progress: SavedProgress, delta: { time: number; moves: number; correct: number }) => void;
  clearProgress: (puzzleId: string) => void;
  completePuzzle: (ev: Omit<CompletionEvent, 'now' | 'dayKey'>) => CompletionResult;
  resetAll: () => void;
  toasts: AchievementToast[];
  dismissToast: (id: number) => void;
}

const Ctx = createContext<StoreApi | null>(null);

export function useStore(): StoreApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: SaveData }) {
  const [save, setSave] = useState<SaveData>(() => initial ?? loadSave());
  const saveRef = useRef(save);
  const [toasts, setToasts] = useState<AchievementToast[]>([]);
  const toastId = useRef(1);

  const commit = useCallback((next: SaveData) => {
    saveRef.current = next;
    setSave(next);
    persist(next);
  }, []);

  // initial persist so topped-up hints etc. are stored
  useEffect(() => {
    persist(saveRef.current);
    const flush = () => persist(saveRef.current);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  // apply settings side effects
  const { lang, theme, sfx, music, vibration } = save.settings;
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && !!mq?.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14151f' : '#f4f3ff');
    };
    apply();
    mq?.addEventListener?.('change', apply);
    return () => mq?.removeEventListener?.('change', apply);
  }, [lang, theme]);
  useEffect(() => setSfxEnabled(sfx), [sfx]);
  useEffect(() => setVibrationEnabled(vibration), [vibration]);
  useEffect(() => {
    if (!music) { setMusicEnabled(false); return; }
    // music can only start after a user gesture; start now (settings toggle is a gesture) and on first input otherwise
    setMusicEnabled(true);
    const kick = () => setMusicEnabled(true);
    window.addEventListener('pointerdown', kick, { once: true });
    return () => window.removeEventListener('pointerdown', kick);
  }, [music]);

  const t = useCallback((key: TranslationKey, params?: Params) => translate(lang, key, params), [lang]);

  const api = useMemo<StoreApi>(
    () => ({
      save,
      lang,
      t,
      setSettings: (patch) => commit({ ...saveRef.current, settings: { ...saveRef.current.settings, ...patch } }),
      spendHint: () => {
        const s = saveRef.current;
        if (s.hints <= 0) return false;
        commit({ ...s, hints: s.hints - 1, stats: { ...s.stats, hintsUsed: s.stats.hintsUsed + 1 } });
        return true;
      },
      grantHints: (n) => commit({ ...saveRef.current, hints: saveRef.current.hints + n }),
      recordProgress: (puzzleId, progress, delta) => {
        const s = saveRef.current;
        commit({
          ...s,
          inProgress: { ...s.inProgress, [puzzleId]: progress },
          stats: {
            ...s.stats,
            totalTime: s.stats.totalTime + Math.max(0, delta.time),
            moves: s.stats.moves + Math.max(0, delta.moves),
            correctMoves: s.stats.correctMoves + Math.max(0, delta.correct),
          },
        });
      },
      clearProgress: (puzzleId) => {
        const s = saveRef.current;
        if (!(puzzleId in s.inProgress)) return;
        const inProgress = { ...s.inProgress };
        delete inProgress[puzzleId];
        commit({ ...s, inProgress });
      },
      completePuzzle: (ev) => {
        const result = applyCompletion(saveRef.current, { ...ev, now: Date.now(), dayKey: localDateKey() });
        commit(result.save);
        if (result.newAchievements.length) {
          setToasts((prev) => [...prev, ...result.newAchievements.map((achievementId) => ({ id: toastId.current++, achievementId }))]);
          window.setTimeout(() => playSfx('achievement'), 600);
        }
        return result;
      },
      resetAll: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        const keep = saveRef.current.settings;
        const fresh = { ...detectDefaults(), ...defaultSave(keep.lang, false), settings: keep };
        commit({ ...fresh, lastFreeHint: localDateKey() });
      },
      toasts,
      dismissToast: (id) => setToasts((prev) => prev.filter((x) => x.id !== id)),
    }),
    [save, lang, t, toasts, commit],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
