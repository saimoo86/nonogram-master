import { shiftDateKey } from '../engine/dates';
import { DIFFICULTIES, SIZE_OF, type Difficulty } from '../engine/types';
import type { CompletionEvent, CompletionResult, DiffStats, SaveData } from './types';

// ---------------------------------------------------------------------------
// Save defaults
// ---------------------------------------------------------------------------
const emptyDiff = (): DiffStats => ({ completed: 0, time: 0, best: null, hintFree: 0, perfect: 0 });

export const STARTING_HINTS = 5;
export const DAILY_HINT_TOPUP = 3;

export function defaultSave(systemLang: 'en' | 'ko' = 'en', dark = false): SaveData {
  return {
    version: 1,
    settings: { lang: systemLang, theme: dark ? 'dark' : 'light', sfx: true, music: false, showMistakes: true, vibration: true },
    xp: 0,
    hints: STARTING_HINTS,
    lastFreeHint: null,
    completed: {},
    inProgress: {},
    stats: {
      totalTime: 0,
      moves: 0,
      correctMoves: 0,
      hintsUsed: 0,
      completedTotal: 0,
      hintFreeTotal: 0,
      perfectTotal: 0,
      byDiff: Object.fromEntries(DIFFICULTIES.map((d) => [d, emptyDiff()])) as Record<Difficulty, DiffStats>,
      lastPlayDay: null,
      playStreak: 0,
      bestPlayStreak: 0,
    },
    daily: { completed: {}, streak: 0, bestStreak: 0, lastDate: null, totalTime: 0, best: null },
    achievements: {},
    adFree: false,
  };
}

// ---------------------------------------------------------------------------
// XP / levels
// ---------------------------------------------------------------------------
export const BASE_XP: Record<Difficulty, number> = { easy: 10, normal: 30, hard: 60, expert: 100, master: 150 };

/** Total XP needed to reach `level` (level 1 = 0). */
export function xpToReach(level: number): number {
  return 50 * level * (level - 1);
}

export interface LevelInfo {
  level: number;
  into: number; // xp earned in this level
  need: number; // xp span of this level
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  while (xp >= xpToReach(level + 1)) level++;
  return { level, into: xp - xpToReach(level), need: xpToReach(level + 1) - xpToReach(level) };
}

export function computeXp(ev: Pick<CompletionEvent, 'difficulty' | 'hints' | 'mistakes' | 'dailyKey'>, firstTime: boolean, dailyStreak = 0): number {
  let xp = BASE_XP[ev.difficulty];
  if (ev.hints === 0) xp *= 1.25;
  if (ev.mistakes === 0) xp *= 1.25;
  if (ev.dailyKey) xp = xp * 1.5 + Math.min(dailyStreak, 7) * 5;
  if (!firstTime) xp *= 0.25; // replays still pay, but farming is discouraged
  return Math.max(1, Math.round(xp));
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------
export interface AchievementDef {
  id: string;
  icon: string;
  reward: { xp: number; hints: number };
  /** progress toward the goal for display; for one-shot achievements max = 1 */
  progress: (s: SaveData) => { cur: number; max: number };
  /** evaluated right after a completion; `ev` is that completion */
  check: (s: SaveData, ev: CompletionEvent) => boolean;
}

const count = (max: number) => (s: SaveData) => ({ cur: Math.min(max, s.stats.completedTotal), max });
const tier = (d: Difficulty) => (s: SaveData) => ({ cur: Math.min(1, s.stats.byDiff[d].completed), max: 1 });

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first', icon: '🌱', reward: { xp: 20, hints: 2 }, progress: count(1), check: (s) => s.stats.completedTotal >= 1 },
  { id: 'ten', icon: '🔟', reward: { xp: 50, hints: 2 }, progress: count(10), check: (s) => s.stats.completedTotal >= 10 },
  { id: 'fifty', icon: '🏅', reward: { xp: 150, hints: 4 }, progress: count(50), check: (s) => s.stats.completedTotal >= 50 },
  { id: 'hundred', icon: '🏆', reward: { xp: 300, hints: 6 }, progress: count(100), check: (s) => s.stats.completedTotal >= 100 },
  { id: 'hard', icon: '🧩', reward: { xp: 80, hints: 3 }, progress: tier('hard'), check: (s) => s.stats.byDiff.hard.completed >= 1 },
  { id: 'expert', icon: '🔥', reward: { xp: 150, hints: 4 }, progress: tier('expert'), check: (s) => s.stats.byDiff.expert.completed >= 1 },
  { id: 'master', icon: '👑', reward: { xp: 300, hints: 6 }, progress: tier('master'), check: (s) => s.stats.byDiff.master.completed >= 1 },
  {
    id: 'daily7', icon: '📅', reward: { xp: 200, hints: 5 },
    progress: (s) => ({ cur: Math.min(7, s.daily.bestStreak), max: 7 }),
    check: (s) => s.daily.bestStreak >= 7,
  },
  { id: 'nohint', icon: '💡', reward: { xp: 40, hints: 1 }, progress: (s) => ({ cur: Math.min(1, s.stats.hintFreeTotal), max: 1 }), check: (_s, ev) => ev.hints === 0 },
  { id: 'nomistake', icon: '🎯', reward: { xp: 40, hints: 1 }, progress: (s) => ({ cur: Math.min(1, s.stats.perfectTotal), max: 1 }), check: (_s, ev) => ev.mistakes === 0 },
];

export function sizeOf(d: Difficulty): number {
  return SIZE_OF[d];
}

// ---------------------------------------------------------------------------
// Applying a completed puzzle (pure)
// ---------------------------------------------------------------------------
export function applyCompletion(prev: SaveData, ev: CompletionEvent): CompletionResult {
  const save: SaveData = structuredClone(prev);
  const levelBefore = levelInfo(save.xp).level;
  const key = ev.dailyKey ? `daily-${ev.dailyKey}` : ev.puzzleId;
  const rec = save.completed[key];
  const firstTime = !rec;
  const noHint = ev.hints === 0;
  const perfect = ev.mistakes === 0;

  save.completed[key] = {
    best: rec ? Math.min(rec.best, ev.time) : ev.time,
    count: (rec?.count ?? 0) + 1,
    bestNoHint: noHint ? (rec?.bestNoHint != null ? Math.min(rec.bestNoHint, ev.time) : ev.time) : (rec?.bestNoHint ?? null),
    perfect: (rec?.perfect ?? false) || perfect,
    firstAt: rec?.firstAt ?? ev.now,
    lastAt: ev.now,
  };
  delete save.inProgress[ev.puzzleId];

  // global + per-difficulty stats
  const st = save.stats;
  st.completedTotal++;
  if (noHint) st.hintFreeTotal++;
  if (perfect) st.perfectTotal++;
  const ds = st.byDiff[ev.difficulty];
  ds.completed++;
  ds.time += ev.time;
  ds.best = ds.best === null ? ev.time : Math.min(ds.best, ev.time);
  if (noHint) ds.hintFree++;
  if (perfect) ds.perfect++;

  // play streak (consecutive local days with at least one completion)
  if (st.lastPlayDay !== ev.dayKey) {
    st.playStreak = st.lastPlayDay && shiftDateKey(st.lastPlayDay, 1) === ev.dayKey ? st.playStreak + 1 : 1;
    st.lastPlayDay = ev.dayKey;
    st.bestPlayStreak = Math.max(st.bestPlayStreak, st.playStreak);
  }

  // daily
  let dailyFirst = false;
  if (ev.dailyKey && !save.daily.completed[ev.dailyKey]) {
    dailyFirst = true;
    const d = save.daily;
    d.completed[ev.dailyKey] = { time: ev.time, hints: ev.hints, mistakes: ev.mistakes };
    d.streak = d.lastDate && shiftDateKey(d.lastDate, 1) === ev.dailyKey ? d.streak + 1 : 1;
    d.lastDate = ev.dailyKey;
    d.bestStreak = Math.max(d.bestStreak, d.streak);
    d.totalTime += ev.time;
    d.best = d.best === null ? ev.time : Math.min(d.best, ev.time);
  }

  // xp & rewards
  const xpGained = computeXp(ev, ev.dailyKey ? dailyFirst : firstTime, save.daily.streak);
  save.xp += xpGained;
  let hintsGained = firstTime ? 1 : 0;

  const newAchievements: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id] || !a.check(save, ev)) continue;
    save.achievements[a.id] = ev.now;
    newAchievements.push(a.id);
    save.xp += a.reward.xp;
    hintsGained += a.reward.hints;
  }
  save.hints += hintsGained;

  return { save, xpGained, hintsGained, firstTime, newAchievements, levelBefore, levelAfter: levelInfo(save.xp).level };
}

// ---------------------------------------------------------------------------
// Collection (derived from completed puzzles)
// ---------------------------------------------------------------------------
/** Largest size at which each scene has been solved. */
export function unlockedScenes(save: SaveData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(save.completed)) {
    if (id.startsWith('daily-')) continue;
    const m = /^(.+)-(\d+)$/.exec(id);
    if (!m) continue;
    const size = Number(m[2]);
    out[m[1]] = Math.max(out[m[1]] ?? 0, size);
  }
  return out;
}
