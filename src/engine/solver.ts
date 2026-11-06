import { colClues, rowClues } from './clues';

/** Line cell: -1 unknown, 0 empty, 1 filled */
export type LineCell = -1 | 0 | 1;

/**
 * Exact single-line solver. Returns the line with every cell that is forced
 * (same in all valid arrangements) fixed, or null if no arrangement exists.
 */
export function solveLine(clue: number[], line: ArrayLike<number>): LineCell[] | null {
  const n = line.length;
  const k = clue.length;
  const W = k + 1;
  // state (pos, j): at cell `pos`, next block to place is `j`, previous cell is empty
  const fwd = new Uint8Array((n + 1) * W);
  const bwd = new Uint8Array((n + 1) * W);
  const idx = (p: number, j: number) => p * W + j;

  const zeros = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) zeros[i + 1] = zeros[i] + (line[i] === 0 ? 1 : 0);

  const fits = (pos: number, b: number): boolean => {
    if (pos + b > n) return false;
    if (zeros[pos + b] - zeros[pos] !== 0) return false;
    if (pos + b < n && line[pos + b] === 1) return false;
    return true;
  };
  const next = (pos: number, b: number) => (pos + b < n ? pos + b + 1 : n);

  fwd[idx(0, 0)] = 1;
  for (let p = 0; p <= n; p++) {
    for (let j = 0; j <= k; j++) {
      if (!fwd[idx(p, j)]) continue;
      if (p < n && line[p] !== 1) fwd[idx(p + 1, j)] = 1;
      if (j < k && fits(p, clue[j])) fwd[idx(next(p, clue[j]), j + 1)] = 1;
    }
  }
  if (!fwd[idx(n, k)]) return null;

  bwd[idx(n, k)] = 1;
  for (let p = n; p >= 0; p--) {
    for (let j = k; j >= 0; j--) {
      let ok = bwd[idx(p, j)] === 1;
      if (!ok) {
        if (p < n && line[p] !== 1 && bwd[idx(p + 1, j)]) ok = true;
        else if (j < k && fits(p, clue[j]) && bwd[idx(next(p, clue[j]), j + 1)]) ok = true;
      }
      if (ok) bwd[idx(p, j)] = 1;
    }
  }

  const can0 = new Uint8Array(n);
  const can1 = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    for (let j = 0; j <= k; j++) {
      if (!fwd[idx(p, j)]) continue;
      if (line[p] !== 1 && bwd[idx(p + 1, j)]) can0[p] = 1;
      if (j < k) {
        const b = clue[j];
        if (fits(p, b) && bwd[idx(next(p, b), j + 1)]) {
          for (let q = p; q < p + b; q++) can1[q] = 1;
          if (p + b < n) can0[p + b] = 1;
        }
      }
    }
  }
  const out: LineCell[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (can0[i] && can1[i]) out[i] = -1;
    else if (can1[i]) out[i] = 1;
    else if (can0[i]) out[i] = 0;
    else return null;
  }
  return out;
}

export interface SolveResult {
  grid: LineCell[][];
  solved: boolean;
  contradiction: boolean;
  sweeps: number;
}

/** Propagate row/column line solving to a fixpoint. `start` may pre-fill cells. */
export function propagate(rows: number[][], cols: number[][], start?: LineCell[][]): SolveResult {
  const R = rows.length;
  const C = cols.length;
  const grid: LineCell[][] = start ? start.map((r) => r.slice()) : Array.from({ length: R }, () => new Array<LineCell>(C).fill(-1));
  let sweeps = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < R; r++) {
      const res = solveLine(rows[r], grid[r]);
      if (!res) return { grid, solved: false, contradiction: true, sweeps };
      for (let c = 0; c < C; c++) if (res[c] !== grid[r][c]) { grid[r][c] = res[c]; changed = true; }
    }
    for (let c = 0; c < C; c++) {
      const col = grid.map((row) => row[c]);
      const res = solveLine(cols[c], col);
      if (!res) return { grid, solved: false, contradiction: true, sweeps };
      for (let r = 0; r < R; r++) if (res[r] !== grid[r][c]) { grid[r][c] = res[r]; changed = true; }
    }
    if (changed) sweeps++;
  }
  const solved = grid.every((row) => row.every((v) => v !== -1));
  return { grid, solved, contradiction: false, sweeps };
}

/** True when pure line-logic solves the puzzle (which implies the solution is unique). */
export function isLogicSolvable(rows: number[][], cols: number[][]): boolean {
  return propagate(rows, cols).solved;
}

/** Count solutions (capped at `limit`) via propagation + backtracking. */
export function countSolutions(rows: number[][], cols: number[][], limit = 2): number {
  let count = 0;
  const rec = (start?: LineCell[][]) => {
    if (count >= limit) return;
    const res = propagate(rows, cols, start);
    if (res.contradiction) return;
    if (res.solved) { count++; return; }
    let br = -1, bc = -1;
    outer: for (let r = 0; r < res.grid.length; r++)
      for (let c = 0; c < res.grid[r].length; c++)
        if (res.grid[r][c] === -1) { br = r; bc = c; break outer; }
    for (const v of [1, 0] as const) {
      const g = res.grid.map((row) => row.slice());
      g[br][bc] = v;
      rec(g);
      if (count >= limit) return;
    }
  };
  rec();
  return count;
}

/** Solve from clues; returns the boolean grid when fully logic-solvable. */
export function solveToGrid(rows: number[][], cols: number[][]): boolean[][] | null {
  const res = propagate(rows, cols);
  if (!res.solved) return null;
  return res.grid.map((r) => r.map((v) => v === 1));
}

export function verifySolution(grid: boolean[][], rows: number[][], cols: number[][]): boolean {
  const a = rowClues(grid);
  const b = colClues(grid);
  const eq = (x: number[][], y: number[][]) => x.length === y.length && x.every((l, i) => l.length === y[i].length && l.every((v, j) => v === y[i][j]));
  return eq(a, rows) && eq(b, cols);
}
