/** Game-board state machine. Pure and UI-independent: reducer + helpers. */
import type { CellState } from './types';

export interface Change {
  i: number;
  from: CellState;
  to: CellState;
}

export interface GameState {
  puzzleId: string;
  size: number;
  solution: boolean[]; // flat, row-major
  cells: CellState[];
  locked: boolean[]; // cells revealed by hints can't be changed
  undo: Change[][];
  redo: Change[][];
  stroke: Change[] | null;
  moves: number;
  correctMoves: number;
  mistakes: number;
  hints: number;
  elapsed: number; // ms
  done: boolean;
}

export type GameAction =
  | { type: 'strokeStart' }
  | { type: 'paint'; i: number; value: CellState }
  | { type: 'strokeEnd' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'hint'; i: number }
  | { type: 'restart' }
  | { type: 'tick'; ms: number };

export function flattenSolution(sol: boolean[][]): boolean[] {
  return sol.flat();
}

export function createGame(puzzleId: string, solution: boolean[][]): GameState {
  const size = solution.length;
  return {
    puzzleId,
    size,
    solution: flattenSolution(solution),
    cells: new Array<CellState>(size * size).fill(0),
    locked: new Array<boolean>(size * size).fill(false),
    undo: [],
    redo: [],
    stroke: null,
    moves: 0,
    correctMoves: 0,
    mistakes: 0,
    hints: 0,
    elapsed: 0,
    done: false,
  };
}

/** Completion is judged only by the filled set matching the solution exactly. X and blank are both "empty". */
export function isSolved(cells: ArrayLike<number>, solution: ArrayLike<boolean>): boolean {
  if (cells.length !== solution.length) return false;
  for (let i = 0; i < cells.length; i++) if ((cells[i] === 1) !== !!solution[i]) return false;
  return true;
}

/** Is this cell currently wrong (shown only when "show mistakes" is on)? */
export function isCellWrong(state: Pick<GameState, 'cells' | 'solution'>, i: number): boolean {
  const v = state.cells[i];
  if (v === 1) return !state.solution[i];
  if (v === 2) return state.solution[i];
  return false;
}

/** Cells that would need to change for the board to match the solution. */
export function hintCandidates(state: GameState): number[] {
  const out: number[] = [];
  for (let i = 0; i < state.cells.length; i++) {
    if (state.locked[i]) continue;
    const v = state.cells[i];
    if (state.solution[i] ? v !== 1 : v === 1) out.push(i);
  }
  return out;
}

function applyCell(state: GameState, cells: CellState[], i: number, value: CellState): Change | null {
  if (i < 0 || i >= cells.length || state.locked[i]) return null;
  const from = cells[i];
  if (from === value) return null;
  cells[i] = value;
  return { i, from, to: value };
}

function judgeMove(state: GameState, i: number, value: CellState): { mistake: boolean; counted: boolean } {
  if (value === 0) return { mistake: false, counted: false }; // erasing is never a mistake
  const wrong = value === 1 ? !state.solution[i] : state.solution[i];
  return { mistake: wrong, counted: true };
}

export function reduceGame(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'tick':
      return state.done ? state : { ...state, elapsed: state.elapsed + action.ms };

    case 'strokeStart':
      if (state.done) return state;
      return { ...state, stroke: [] };

    case 'paint': {
      if (state.done) return state;
      const cells = state.cells.slice();
      const change = applyCell(state, cells, action.i, action.value);
      if (!change) return state;
      const j = judgeMove(state, action.i, action.value);
      const next: GameState = {
        ...state,
        cells,
        moves: state.moves + (j.counted ? 1 : 0),
        correctMoves: state.correctMoves + (j.counted && !j.mistake ? 1 : 0),
        mistakes: state.mistakes + (j.mistake ? 1 : 0),
        redo: [],
      };
      if (state.stroke) next.stroke = [...state.stroke, change];
      else next.undo = [...state.undo, [change]];
      if (isSolved(cells, state.solution)) {
        next.done = true;
        if (next.stroke) {
          next.undo = [...next.undo, next.stroke];
          next.stroke = null;
        }
      }
      return next;
    }

    case 'strokeEnd': {
      if (!state.stroke) return state;
      if (state.stroke.length === 0) return { ...state, stroke: null };
      return { ...state, stroke: null, undo: [...state.undo, state.stroke] };
    }

    case 'undo': {
      if (state.done || state.undo.length === 0) return state;
      const entry = state.undo[state.undo.length - 1];
      const cells = state.cells.slice();
      const applied: Change[] = [];
      for (let k = entry.length - 1; k >= 0; k--) {
        const ch = entry[k];
        if (state.locked[ch.i]) continue;
        cells[ch.i] = ch.from;
        applied.push(ch);
      }
      return { ...state, cells, undo: state.undo.slice(0, -1), redo: [...state.redo, applied.reverse()] };
    }

    case 'redo': {
      if (state.done || state.redo.length === 0) return state;
      const entry = state.redo[state.redo.length - 1];
      const cells = state.cells.slice();
      for (const ch of entry) if (!state.locked[ch.i]) cells[ch.i] = ch.to;
      const next: GameState = { ...state, cells, redo: state.redo.slice(0, -1), undo: [...state.undo, entry] };
      if (isSolved(cells, state.solution)) next.done = true;
      return next;
    }

    case 'hint': {
      if (state.done) return state;
      const cells = state.cells.slice();
      const locked = state.locked.slice();
      const want: CellState = state.solution[action.i] ? 1 : 0;
      cells[action.i] = want;
      locked[action.i] = true;
      const next: GameState = { ...state, cells, locked, hints: state.hints + 1 };
      if (isSolved(cells, state.solution)) next.done = true;
      return next;
    }

    case 'restart':
      return { ...createGame(state.puzzleId, chunk(state.solution, state.size)) };
  }
}

function chunk(flat: boolean[], size: number): boolean[][] {
  const out: boolean[][] = [];
  for (let r = 0; r < size; r++) out.push(flat.slice(r * size, (r + 1) * size));
  return out;
}

// --- persistence helpers -----------------------------------------------------

export interface SavedProgress {
  cells: string;
  locked: string;
  elapsed: number;
  moves: number;
  correct: number;
  mistakes: number;
  hints: number;
  updatedAt: number;
}

export function serializeGame(state: GameState): SavedProgress {
  return {
    cells: state.cells.join(''),
    locked: state.locked.map((b) => (b ? '1' : '0')).join(''),
    elapsed: Math.round(state.elapsed),
    moves: state.moves,
    correct: state.correctMoves,
    mistakes: state.mistakes,
    hints: state.hints,
    updatedAt: Date.now(),
  };
}

/** Restore a saved game; returns a fresh game if the data is malformed or the wrong size. */
export function restoreGame(puzzleId: string, solution: boolean[][], saved: SavedProgress | undefined): GameState {
  const base = createGame(puzzleId, solution);
  if (!saved || typeof saved.cells !== 'string' || saved.cells.length !== base.cells.length) return base;
  if (!/^[012]+$/.test(saved.cells)) return base;
  const cells = Array.from(saved.cells, (ch) => Number(ch) as CellState);
  const locked = Array.from(saved.locked ?? '', (ch) => ch === '1');
  while (locked.length < cells.length) locked.push(false);
  const state: GameState = {
    ...base,
    cells,
    locked: locked.slice(0, cells.length),
    elapsed: Number(saved.elapsed) || 0,
    moves: Number(saved.moves) || 0,
    correctMoves: Number(saved.correct) || 0,
    mistakes: Number(saved.mistakes) || 0,
    hints: Number(saved.hints) || 0,
  };
  return isSolved(cells, base.solution) ? base : state;
}
