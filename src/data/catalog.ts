import raw from './catalog.generated.json';
import { colClues, gridFromStrings, rowClues } from '../engine/clues';
import { generateDaily } from '../engine/generator';
import { SCENES, type Scene } from '../engine/scenes';
import { DIFFICULTIES, type Difficulty, type Puzzle, type PuzzleData, type Theme } from '../engine/types';

export const CATALOG: PuzzleData[] = raw as PuzzleData[];

const byId = new Map(CATALOG.map((p) => [p.id, p]));
const dailyCache = new Map<string, PuzzleData>();

export function getDaily(dateKey: string): PuzzleData {
  let d = dailyCache.get(dateKey);
  if (!d) {
    d = generateDaily(dateKey);
    dailyCache.set(dateKey, d);
  }
  return d;
}

export function getPuzzleData(id: string): PuzzleData | undefined {
  if (id.startsWith('daily-')) return getDaily(id.slice(6));
  return byId.get(id);
}

export function puzzlesOf(d: Difficulty): PuzzleData[] {
  return CATALOG.filter((p) => p.difficulty === d);
}

/** Build the playable puzzle (clues derived from the solution, never stored separately). */
export function toPuzzle(data: PuzzleData): Puzzle {
  const solution = gridFromStrings(data.solution);
  return { id: data.id, size: data.size, solution, rowClues: rowClues(solution), colClues: colClues(solution) };
}

export function sceneOf(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}

export function scenesOfTheme(theme: Theme): Scene[] {
  return SCENES.filter((s) => s.theme === theme);
}

/** Best (largest) catalog art for a scene, for the collection view. */
export function artFor(sceneId: string, atSize?: number): PuzzleData | undefined {
  const list = CATALOG.filter((p) => p.sceneId === sceneId).sort((a, b) => b.size - a.size);
  return atSize ? (list.find((p) => p.size === atSize) ?? list[0]) : list[0];
}

export const TIER_COUNTS = Object.fromEntries(DIFFICULTIES.map((d) => [d, puzzlesOf(d).length])) as Record<Difficulty, number>;
