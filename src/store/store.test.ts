import { describe, expect, it } from 'vitest';
import { CATALOG, puzzlesOf } from '../data/catalog';
import { shiftDateKey } from '../engine/dates';
import { en } from '../i18n/en';
import { ko } from '../i18n/ko';
import { translate } from '../i18n';
import { ACHIEVEMENTS, applyCompletion, computeXp, defaultSave, levelInfo, unlockedScenes, xpToReach } from './progression';
import { migrate, persist, loadSave, STORAGE_KEY, topUpHints } from './storage';
import type { CompletionEvent, SaveData } from './types';

const ev = (over: Partial<CompletionEvent> = {}): CompletionEvent => ({
  puzzleId: 'cat-5', difficulty: 'easy', time: 30000, hints: 0, mistakes: 0, now: 1_700_000_000_000, dayKey: '2026-05-01', ...over,
});

describe('xp and levels', () => {
  it('level thresholds', () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(100);
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(299).level).toBe(2);
    expect(levelInfo(300).level).toBe(3);
    const li = levelInfo(150);
    expect(li.into).toBe(50);
    expect(li.need).toBe(200);
  });
  it('xp scales with difficulty and bonuses; replays are reduced', () => {
    const base = computeXp({ difficulty: 'easy', hints: 3, mistakes: 2 }, true);
    expect(base).toBe(10);
    expect(computeXp({ difficulty: 'master', hints: 3, mistakes: 2 }, true)).toBeGreaterThan(computeXp({ difficulty: 'hard', hints: 3, mistakes: 2 }, true));
    expect(computeXp({ difficulty: 'easy', hints: 0, mistakes: 0 }, true)).toBeGreaterThan(base);
    expect(computeXp({ difficulty: 'easy', hints: 3, mistakes: 2 }, false)).toBeLessThan(base);
  });
});

describe('completion, achievements, rewards', () => {
  it('first puzzle awards xp, hints, and the right achievements', () => {
    const s0 = defaultSave();
    const r = applyCompletion(s0, ev());
    expect(r.firstTime).toBe(true);
    expect(r.xpGained).toBeGreaterThan(0);
    expect(r.newAchievements.sort()).toEqual(['first', 'nohint', 'nomistake']);
    expect(r.save.xp).toBe(r.xpGained + 20 + 40 + 40);
    expect(r.save.hints).toBe(s0.hints + 1 + 2 + 1 + 1);
    expect(r.save.stats.completedTotal).toBe(1);
    expect(r.save.completed['cat-5'].count).toBe(1);
    expect(r.levelAfter).toBeGreaterThan(r.levelBefore);
    // original is not mutated
    expect(s0.xp).toBe(0);
  });
  it('hint use and mistakes withhold the clean-run achievements', () => {
    const r = applyCompletion(defaultSave(), ev({ hints: 2, mistakes: 1 }));
    expect(r.newAchievements).toEqual(['first']);
    expect(r.save.stats.hintFreeTotal).toBe(0);
    expect(r.save.stats.perfectTotal).toBe(0);
  });
  it('achievements are only granted once, replay xp is reduced', () => {
    const a = applyCompletion(defaultSave(), ev());
    const b = applyCompletion(a.save, ev());
    expect(b.firstTime).toBe(false);
    expect(b.newAchievements).toEqual([]);
    expect(b.xpGained).toBeLessThan(a.xpGained);
    expect(b.save.completed['cat-5'].count).toBe(2);
    expect(b.save.stats.completedTotal).toBe(2);
  });
  it('completion-count achievements at 10 / 50 / 100', () => {
    let s: SaveData = defaultSave();
    const ids = CATALOG.map((p) => p).slice(0, 100);
    const unlockedAt: Record<string, number> = {};
    ids.forEach((p, i) => {
      const r = applyCompletion(s, ev({ puzzleId: p.id, difficulty: p.difficulty }));
      s = r.save;
      for (const a of r.newAchievements) unlockedAt[a] = i + 1;
    });
    expect(unlockedAt.first).toBe(1);
    expect(unlockedAt.ten).toBe(10);
    expect(unlockedAt.fifty).toBe(50);
    expect(unlockedAt.hundred).toBe(100);
  });
  it('tier achievements: hard / expert / master', () => {
    let s = defaultSave();
    const got = (d: 'hard' | 'expert' | 'master') => {
      const p = puzzlesOf(d)[0];
      const r = applyCompletion(s, ev({ puzzleId: p.id, difficulty: d }));
      s = r.save;
      return r.newAchievements;
    };
    expect(got('hard')).toContain('hard');
    expect(got('expert')).toContain('expert');
    expect(got('master')).toContain('master');
    expect(s.stats.byDiff.master.completed).toBe(1);
  });
  it('daily: streak counts consecutive days, resets on a gap, 7 days unlocks the achievement', () => {
    let s = defaultSave();
    let day = '2026-06-01';
    let lastNew: string[] = [];
    for (let i = 0; i < 7; i++) {
      const r = applyCompletion(s, ev({ puzzleId: `daily-${day}`, dailyKey: day, difficulty: 'normal' }));
      s = r.save;
      lastNew = r.newAchievements;
      day = shiftDateKey(day, 1);
    }
    expect(s.daily.streak).toBe(7);
    expect(lastNew).toContain('daily7');
    expect(s.daily.completed['2026-06-07']).toBeDefined();
    // gap of two days resets
    const gapDay = shiftDateKey(day, 2);
    const r2 = applyCompletion(s, ev({ puzzleId: `daily-${gapDay}`, dailyKey: gapDay, difficulty: 'normal' }));
    expect(r2.save.daily.streak).toBe(1);
    expect(r2.save.daily.bestStreak).toBe(7);
  });
  it('daily completion twice on the same date does not double-count', () => {
    const a = applyCompletion(defaultSave(), ev({ puzzleId: 'daily-2026-06-01', dailyKey: '2026-06-01', difficulty: 'normal' }));
    const b = applyCompletion(a.save, ev({ puzzleId: 'daily-2026-06-01', dailyKey: '2026-06-01', difficulty: 'normal' }));
    expect(b.save.daily.streak).toBe(1);
    expect(Object.keys(b.save.daily.completed).length).toBe(1);
  });
  it('play streak across days', () => {
    let s = defaultSave();
    for (const [i, day] of ['2026-05-01', '2026-05-02', '2026-05-03'].entries()) {
      s = applyCompletion(s, ev({ puzzleId: `heart-${i}`, dayKey: day })).save;
    }
    expect(s.stats.playStreak).toBe(3);
    s = applyCompletion(s, ev({ puzzleId: 'x-9', dayKey: '2026-05-10' })).save;
    expect(s.stats.playStreak).toBe(1);
    expect(s.stats.bestPlayStreak).toBe(3);
  });
  it('records best times, per-difficulty stats, and clears in-progress', () => {
    let s = defaultSave();
    s.inProgress['cat-5'] = { cells: '0'.repeat(25), locked: '0'.repeat(25), elapsed: 5, moves: 0, correct: 0, mistakes: 0, hints: 0, updatedAt: 1 };
    s = applyCompletion(s, ev({ time: 50000 })).save;
    s = applyCompletion(s, ev({ time: 40000, hints: 1 })).save;
    expect(s.inProgress['cat-5']).toBeUndefined();
    expect(s.completed['cat-5'].best).toBe(40000);
    expect(s.completed['cat-5'].bestNoHint).toBe(50000);
    expect(s.stats.byDiff.easy.completed).toBe(2);
    expect(s.stats.byDiff.easy.best).toBe(40000);
    expect(s.stats.byDiff.easy.hintFree).toBe(1);
  });
  it('all ten required achievements exist with progress functions', () => {
    expect(ACHIEVEMENTS.map((a) => a.id).sort()).toEqual(['daily7', 'expert', 'fifty', 'first', 'hard', 'hundred', 'master', 'nohint', 'nomistake', 'ten']);
    for (const a of ACHIEVEMENTS) {
      const p = a.progress(defaultSave());
      expect(p.max).toBeGreaterThan(0);
      expect(p.cur).toBe(0);
    }
  });
});

describe('collection unlocking', () => {
  it('unlocks a scene when any size is solved and tracks the largest', () => {
    let s = defaultSave();
    expect(unlockedScenes(s)).toEqual({});
    s = applyCompletion(s, ev({ puzzleId: 'cat-5' })).save;
    s = applyCompletion(s, ev({ puzzleId: 'cat-15', difficulty: 'hard' })).save;
    s = applyCompletion(s, ev({ puzzleId: 'fish-10', difficulty: 'normal' })).save;
    s = applyCompletion(s, ev({ puzzleId: 'daily-2026-06-01', dailyKey: '2026-06-01' })).save;
    expect(unlockedScenes(s)).toEqual({ cat: 15, fish: 10 });
  });
});

describe('storage', () => {
  const mem = () => {
    const d = new Map<string, string>();
    return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v) };
  };
  it('round-trips save data', () => {
    const m = mem();
    const r = applyCompletion(defaultSave(), ev());
    expect(persist(r.save, m)).toBe(true);
    const loaded = loadSave(m);
    expect(loaded.xp).toBe(r.save.xp);
    expect(loaded.completed['cat-5']).toEqual(r.save.completed['cat-5']);
    expect(loaded.achievements).toEqual(r.save.achievements);
  });
  it('survives corrupt or partial data', () => {
    const m = mem();
    m.setItem(STORAGE_KEY, '{not json');
    expect(loadSave(m).stats.completedTotal).toBe(0);
    m.setItem(STORAGE_KEY, JSON.stringify({ xp: 55, settings: { lang: 'zz' } }));
    const l = loadSave(m);
    expect(l.xp).toBe(55);
    expect(['en', 'ko']).toContain(l.settings.lang);
    expect(l.stats.byDiff.master).toBeDefined();
    expect(migrate(null).version).toBe(1);
  });
  it('tops up hints once per day', () => {
    const s = { ...defaultSave(), hints: 0, lastFreeHint: null };
    const a = topUpHints(s, '2026-01-01');
    expect(a.hints).toBe(3);
    const used = { ...a, hints: 1 };
    expect(topUpHints(used, '2026-01-01').hints).toBe(1);
    expect(topUpHints(used, '2026-01-02').hints).toBe(3);
    expect(topUpHints({ ...used, hints: 9 }, '2026-01-03').hints).toBe(9);
  });
});

describe('i18n', () => {
  it('Korean has every English key, non-empty, with matching placeholders', () => {
    const ph = (s: string) => (s.match(/\{[a-z]+\}/gi) ?? []).sort().join(',');
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(ko[k], `missing ko:${k}`).toBeTruthy();
      expect(ph(ko[k]), `placeholder mismatch ${k}`).toBe(ph(en[k]));
    }
    expect(Object.keys(ko).length).toBe(Object.keys(en).length);
  });
  it('translate interpolates, switches language, and falls back', () => {
    expect(translate('en', 'common.level', { n: 4 })).toBe('Lv. 4');
    expect(translate('ko', 'menu.play')).toBe('플레이');
    expect(translate('xx', 'menu.play')).toBe('Play');
  });
});
