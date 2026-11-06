import { describe, expect, it } from 'vitest';
import { CATALOG, getDaily, puzzlesOf, toPuzzle } from '../data/catalog';
import { colClues, lineClue, rowClues, validateClues, gridFromStrings } from './clues';
import { createGame, hintCandidates, isSolved, reduceGame, restoreGame, serializeGame, type GameState } from './board';
import { dailySizeFor, generateDaily } from './generator';
import { countSolutions, isLogicSolvable, propagate, solveLine, solveToGrid, verifySolution } from './solver';
import { DIFFICULTIES, DIFF_OF_SIZE, SIZE_OF } from './types';
import { SCENES } from './scenes';
import { shiftDateKey, utcDateKey } from './dates';

/** Independent brute-force solution counter (does not use the line solver). */
function bruteCount(rows: number[][], cols: number[][], limit = 2): number {
  const n = cols.length;
  const rowOptions = rows.map((clue) => {
    const opts: number[][] = [];
    for (let mask = 0; mask < 1 << n; mask++) {
      const line = Array.from({ length: n }, (_, i) => (mask >> i) & 1);
      const c = lineClue(line);
      if (c.length === clue.length && c.every((v, i) => v === clue[i])) opts.push(line);
    }
    return opts;
  });
  const prefixOk = (placed: number[][], c: number): boolean => {
    const col = placed.map((r) => r[c]);
    const runs = lineClue(col);
    const open = col[col.length - 1] === 1;
    if (runs.length > cols[c].length) return false;
    for (let i = 0; i < runs.length; i++) {
      const last = i === runs.length - 1;
      if (last && open) { if (runs[i] > cols[c][i]) return false; }
      else if (runs[i] !== cols[c][i]) return false;
    }
    return true;
  };
  let count = 0;
  const rec = (placed: number[][]) => {
    if (count >= limit) return;
    if (placed.length === rows.length) {
      for (let c = 0; c < n; c++) {
        const cc = lineClue(placed.map((r) => r[c]));
        if (cc.length !== cols[c].length || cc.some((v, i) => v !== cols[c][i])) return;
      }
      count++;
      return;
    }
    for (const opt of rowOptions[placed.length]) {
      const next = [...placed, opt];
      let ok = true;
      for (let c = 0; c < n && ok; c++) ok = prefixOk(next, c);
      if (ok) rec(next);
      if (count >= limit) return;
    }
  };
  rec([]);
  return count;
}

describe('clue generation', () => {
  it('computes line clues', () => {
    expect(lineClue([0, 0, 0])).toEqual([]);
    expect(lineClue([1, 1, 0, 1])).toEqual([2, 1]);
    expect(lineClue([true, false, true, true, true])).toEqual([1, 3]);
    expect(lineClue([1, 1, 1, 1, 1])).toEqual([5]);
  });
  it('row/col clues of a known grid', () => {
    const g = gridFromStrings(['10100', '11100', '00110', '00010', '11111']);
    expect(rowClues(g)).toEqual([[1, 1], [3], [2], [1], [5]]);
    expect(colClues(g)).toEqual([[2, 1], [1, 1], [3, 1], [3], [1]]);
  });
});

describe('line solver', () => {
  it('overlap deductions', () => {
    expect(solveLine([4], [-1, -1, -1, -1, -1])).toEqual([-1, 1, 1, 1, -1]);
    expect(solveLine([1, 1], [-1, -1, -1])).toEqual([1, 0, 1]);
    expect(solveLine([5], [-1, -1, -1, -1, -1])).toEqual([1, 1, 1, 1, 1]);
    expect(solveLine([], [-1, -1, -1])).toEqual([0, 0, 0]);
  });
  it('detects contradictions', () => {
    expect(solveLine([3], [0, 0, 1, 0, 0])).toBeNull();
    expect(solveLine([2, 2], [-1, -1, -1])).toBeNull();
  });
  it('respects known cells', () => {
    expect(solveLine([2], [-1, 0, -1, -1])).toEqual([0, 0, 1, 1]);
  });
  it('counts multiple solutions for ambiguous puzzles', () => {
    // 2x2 checkerboard has exactly two solutions
    expect(countSolutions([[1], [1]], [[1], [1]])).toBe(2);
    expect(bruteCount([[1], [1]], [[1], [1]])).toBe(2);
    expect(isLogicSolvable([[1], [1]], [[1], [1]])).toBe(false);
  });
  it('counts zero solutions for inconsistent clues', () => {
    expect(countSolutions([[2], [2]], [[1], [1]])).toBe(0);
    expect(propagate([[2], [2]], [[1], [1]]).contradiction).toBe(true);
  });
});

describe('puzzle catalog', () => {
  it('provides every difficulty with plenty of puzzles', () => {
    for (const d of DIFFICULTIES) expect(puzzlesOf(d).length, d).toBeGreaterThanOrEqual(20);
    expect(CATALOG.length).toBeGreaterThanOrEqual(100);
  });
  it('has all six themes with 4 scenes each', () => {
    expect(SCENES.length).toBe(24);
    for (const t of ['animals', 'food', 'nature', 'objects', 'fantasy', 'space']) expect(SCENES.filter((s) => s.theme === t).length).toBe(4);
  });
  it('ids are unique and sizes match difficulty', () => {
    expect(new Set(CATALOG.map((p) => p.id)).size).toBe(CATALOG.length);
    for (const p of CATALOG) {
      expect(p.size).toBe(SIZE_OF[p.difficulty]);
      expect(DIFF_OF_SIZE[p.size]).toBe(p.difficulty);
      expect(p.solution.length).toBe(p.size);
      expect(p.solution.every((r) => r.length === p.size && /^[01]+$/.test(r))).toBe(true);
    }
  });
  it('every puzzle: clues match solution, solution is valid and UNIQUE', () => {
    for (const data of CATALOG) {
      const pz = toPuzzle(data);
      expect(validateClues(pz.rowClues, pz.colClues), data.id).toBe(true);
      expect(verifySolution(pz.solution, pz.rowClues, pz.colClues), data.id).toBe(true);
      // solving from clues alone reproduces exactly the stored solution
      const solved = solveToGrid(pz.rowClues, pz.colClues);
      expect(solved, `${data.id} not logic-solvable`).not.toBeNull();
      expect(solved).toEqual(pz.solution);
      // backtracking counter agrees on uniqueness
      expect(countSolutions(pz.rowClues, pz.colClues, 2), data.id).toBe(1);
    }
  });
  it('independent brute force confirms uniqueness for all 5x5 and 10x10 puzzles', () => {
    for (const data of CATALOG.filter((p) => p.size <= 10)) {
      const pz = toPuzzle(data);
      expect(bruteCount(pz.rowClues, pz.colClues, 2), data.id).toBe(1);
    }
  });
  it('logical complexity grows with difficulty', () => {
    const avg = DIFFICULTIES.map((d) => puzzlesOf(d).reduce((a, p) => a + p.sweeps, 0) / puzzlesOf(d).length);
    expect(avg[0]).toBeLessThan(avg[1]);
    expect(avg[1]).toBeLessThan(avg[2]);
    expect(avg[2]).toBeLessThan(avg[3]);
    expect(avg[4]).toBeGreaterThan(avg[1]);
  });
  it('colors palette is consistent with solution', () => {
    for (const p of CATALOG) {
      for (let r = 0; r < p.size; r++)
        for (let c = 0; c < p.size; c++) expect(p.colors[r][c] === '.').toBe(p.solution[r][c] === '0');
    }
  });
});

describe('daily puzzle', () => {
  it('is deterministic for a date and differs between dates', () => {
    const a = generateDaily('2026-03-14');
    const b = generateDaily('2026-03-14');
    expect(a).toEqual(b);
    expect(generateDaily('2026-03-15').solution).not.toEqual(a.solution);
    expect(getDaily('2026-03-14')).toEqual(a);
  });
  it('is unique-solvable with correct size for 60 consecutive days', () => {
    let day = '2026-11-01';
    const solutions = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const d = generateDaily(day);
      expect(d.size).toBe(dailySizeFor(day));
      const pz = toPuzzle(d);
      expect(isLogicSolvable(pz.rowClues, pz.colClues), day).toBe(true);
      expect(countSolutions(pz.rowClues, pz.colClues, 2)).toBe(1);
      solutions.add(d.solution.join('|'));
      day = shiftDateKey(day, 1);
    }
    expect(solutions.size).toBeGreaterThan(55);
  });
  it('uses UTC date keys', () => {
    expect(utcDateKey(Date.UTC(2026, 0, 1, 23, 59))).toBe('2026-01-01');
    expect(utcDateKey(Date.UTC(2026, 0, 2, 0, 0))).toBe('2026-01-02');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('game board', () => {
  const sol = gridFromStrings(['10100', '11100', '00110', '00010', '11111']);
  const paint = (s: GameState, i: number, v: 0 | 1 | 2) => reduceGame(s, { type: 'paint', i, value: v });

  it('distinguishes X from unknown and ignores X for completion', () => {
    let s = createGame('t', sol);
    s = paint(s, 1, 2);
    expect(s.cells[1]).toBe(2);
    expect(s.cells[3]).toBe(0);
    expect(s.mistakes).toBe(0); // X on a truly empty cell is right
    // fill every correct cell; X's remain and the puzzle is still solved
    sol.flat().forEach((b, i) => { if (b) s = paint(s, i, 1); });
    expect(s.done).toBe(true);
  });
  it('is not solved with a wrong or missing cell', () => {
    let s = createGame('t', sol);
    sol.flat().forEach((b, i) => { if (b) s = paint(s, i, 1); });
    expect(isSolved(s.cells, s.solution)).toBe(true);
    const t = createGame('t', sol);
    expect(isSolved(t.cells, t.solution)).toBe(false);
    const almost = createGame('t', sol);
    let u = almost;
    sol.flat().forEach((b, i) => { if (b && i !== 0) u = paint(u, i, 1); });
    expect(u.done).toBe(false);
    u = paint(u, 1 * 5 + 4, 1); // wrong extra cell
    u = paint(u, 0, 1);
    expect(u.done).toBe(false); // extra filled cell => not solved
  });
  it('counts mistakes and accuracy; erasing is free', () => {
    let s = createGame('t', sol);
    s = paint(s, 1, 1); // wrong (solution empty)
    s = paint(s, 0, 1); // right
    s = paint(s, 1, 0); // erase
    s = paint(s, 0, 2); // X over a correct cell => mistake
    expect(s.mistakes).toBe(2);
    expect(s.moves).toBe(3);
    expect(s.correctMoves).toBe(1);
  });
  it('undo / redo, including whole drag strokes', () => {
    let s = createGame('t', sol);
    s = reduceGame(s, { type: 'strokeStart' });
    s = paint(s, 0, 1);
    s = paint(s, 2, 1);
    s = reduceGame(s, { type: 'strokeEnd' });
    s = paint(s, 7, 1);
    expect(s.undo.length).toBe(2);
    s = reduceGame(s, { type: 'undo' });
    expect(s.cells[7]).toBe(0);
    s = reduceGame(s, { type: 'undo' });
    expect(s.cells[0]).toBe(0);
    expect(s.cells[2]).toBe(0);
    s = reduceGame(s, { type: 'redo' });
    expect(s.cells[0]).toBe(1);
    expect(s.cells[2]).toBe(1);
    s = paint(s, 9, 1); // new move clears redo
    expect(s.redo.length).toBe(0);
    expect(reduceGame(createGame('t', sol), { type: 'undo' }).undo.length).toBe(0); // nothing to undo is safe
  });
  it('hint fills a correct cell, locks it, and ignores unrelated cells', () => {
    let s = createGame('t', sol);
    const cand = hintCandidates(s);
    expect(cand.length).toBe(sol.flat().filter(Boolean).length);
    s = reduceGame(s, { type: 'hint', i: cand[0] });
    expect(s.cells[cand[0]]).toBe(1);
    expect(s.hints).toBe(1);
    s = paint(s, cand[0], 0); // locked: no change
    expect(s.cells[cand[0]]).toBe(1);
    // wrong fill is a hint candidate and gets corrected
    let w = paint(createGame('t', sol), 1, 1);
    expect(hintCandidates(w)).toContain(1);
    w = reduceGame(w, { type: 'hint', i: 1 });
    expect(w.cells[1]).toBe(0);
  });
  it('restart resets everything; save/restore round-trips', () => {
    let s = createGame('p1', sol);
    s = paint(s, 0, 1);
    s = paint(s, 1, 2);
    s = reduceGame(s, { type: 'tick', ms: 5000 });
    const saved = JSON.parse(JSON.stringify(serializeGame(s)));
    const r = restoreGame('p1', sol, saved);
    expect(r.cells).toEqual(s.cells);
    expect(r.elapsed).toBe(5000);
    expect(r.moves).toBe(s.moves);
    const reset = reduceGame(s, { type: 'restart' });
    expect(reset.cells.every((c) => c === 0)).toBe(true);
    expect(reset.moves).toBe(0);
    expect(reset.elapsed).toBe(0);
  });
  it('rejects corrupt saves', () => {
    const bad = restoreGame('p', sol, { cells: 'xyz', locked: '', elapsed: 1, moves: 0, correct: 0, mistakes: 0, hints: 0, updatedAt: 0 });
    expect(bad.cells.every((c) => c === 0)).toBe(true);
    expect(restoreGame('p', sol, undefined).cells.length).toBe(25);
  });
});
