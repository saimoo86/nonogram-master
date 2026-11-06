import { DAILY_HINT_TOPUP, defaultSave } from './progression';
import { localDateKey } from '../engine/dates';
import type { SaveData } from './types';

export const STORAGE_KEY = 'nonogram-master.save.v1';

export function detectDefaults(): SaveData {
  let lang: 'en' | 'ko' = 'en';
  let dark = false;
  try {
    if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ko')) lang = 'ko';
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) dark = true;
  } catch { /* ignore */ }
  const s = defaultSave(lang, false);
  s.settings.theme = dark ? 'dark' : 'light';
  return s;
}

/** Merge loaded data over defaults so older / partial saves never crash the app. */
export function migrate(raw: unknown, base: SaveData = detectDefaults()): SaveData {
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<SaveData>;
  const out: SaveData = {
    ...base,
    ...r,
    version: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    stats: {
      ...base.stats,
      ...(r.stats ?? {}),
      byDiff: { ...base.stats.byDiff, ...(r.stats?.byDiff ?? {}) },
    },
    daily: { ...base.daily, ...(r.daily ?? {}) },
    completed: r.completed ?? {},
    inProgress: r.inProgress ?? {},
    achievements: r.achievements ?? {},
  };
  if (!['en', 'ko'].includes(out.settings.lang)) out.settings.lang = base.settings.lang;
  if (typeof out.xp !== 'number' || !isFinite(out.xp)) out.xp = 0;
  if (typeof out.hints !== 'number' || !isFinite(out.hints)) out.hints = base.hints;
  return out;
}

export function loadSave(storage: Pick<Storage, 'getItem'> = localStorage): SaveData {
  try {
    const txt = storage.getItem(STORAGE_KEY);
    if (!txt) return topUpHints(detectDefaults());
    return topUpHints(migrate(JSON.parse(txt)));
  } catch {
    return topUpHints(detectDefaults());
  }
}

export function persist(save: SaveData, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

/** Once per local day, refill hints up to DAILY_HINT_TOPUP. */
export function topUpHints(save: SaveData, today = localDateKey()): SaveData {
  if (save.lastFreeHint === today) return save;
  return { ...save, lastFreeHint: today, hints: Math.max(save.hints, DAILY_HINT_TOPUP) };
}
