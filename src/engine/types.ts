export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'master';
export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard', 'expert', 'master'];
export const SIZE_OF: Record<Difficulty, number> = { easy: 5, normal: 10, hard: 15, expert: 20, master: 25 };
export const DIFF_OF_SIZE: Record<number, Difficulty> = { 5: 'easy', 10: 'normal', 15: 'hard', 20: 'expert', 25: 'master' };

export type Theme = 'animals' | 'food' | 'nature' | 'objects' | 'fantasy' | 'space';
export const THEMES: Theme[] = ['animals', 'food', 'nature', 'objects', 'fantasy', 'space'];

/** 0 = unknown, 1 = filled, 2 = X mark */
export type CellState = 0 | 1 | 2;

/** A puzzle as stored in the catalog. Solution rows are strings of 0/1. Colors: palette index per cell ('.' = none). */
export interface PuzzleData {
  id: string; // `${sceneId}-${size}`
  sceneId: string;
  theme: Theme | 'daily';
  size: number;
  difficulty: Difficulty;
  solution: string[]; // size strings of 0/1
  colors: string[]; // size strings; char = palette idx (hex digit) or '.'
  palette: string[]; // css colors
  sweeps: number; // logical complexity: line-solver sweeps required
  stars: number; // 1..5 relative logical difficulty within its tier
}

export interface Puzzle {
  id: string;
  size: number;
  solution: boolean[][]; // [row][col]
  rowClues: number[][];
  colClues: number[][];
}
