import type { SavedProgress } from '../engine/board';
import type { Difficulty } from '../engine/types';

export type LangCode = 'en' | 'ko';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  lang: LangCode;
  theme: ThemeMode;
  sfx: boolean;
  music: boolean;
  showMistakes: boolean;
  vibration: boolean;
}

export interface CompletedRecord {
  best: number; // ms
  count: number;
  bestNoHint: number | null;
  perfect: boolean; // ever finished with zero mistakes
  firstAt: number;
  lastAt: number;
}

export interface DiffStats {
  completed: number;
  time: number; // total ms of completed runs
  best: number | null;
  hintFree: number;
  perfect: number;
}

export interface DailyRecord {
  time: number;
  hints: number;
  mistakes: number;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  xp: number;
  hints: number;
  lastFreeHint: string | null;
  completed: Record<string, CompletedRecord>;
  inProgress: Record<string, SavedProgress>;
  stats: {
    totalTime: number;
    moves: number;
    correctMoves: number;
    hintsUsed: number;
    completedTotal: number;
    hintFreeTotal: number;
    perfectTotal: number;
    byDiff: Record<Difficulty, DiffStats>;
    lastPlayDay: string | null;
    playStreak: number;
    bestPlayStreak: number;
  };
  daily: {
    completed: Record<string, DailyRecord>;
    streak: number;
    bestStreak: number;
    lastDate: string | null;
    totalTime: number;
    best: number | null;
  };
  achievements: Record<string, number>;
  adFree: boolean;
}

export interface CompletionEvent {
  puzzleId: string;
  difficulty: Difficulty;
  dailyKey?: string; // set for the daily puzzle
  time: number;
  hints: number;
  mistakes: number;
  now: number;
  dayKey: string; // local date key for play streak
}

export interface CompletionResult {
  save: SaveData;
  xpGained: number;
  hintsGained: number;
  firstTime: boolean;
  newAchievements: string[];
  levelBefore: number;
  levelAfter: number;
}
