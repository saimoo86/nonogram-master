/** Clue generation & validation — pure logic, no UI. */

export function lineClue(line: ArrayLike<boolean | number>): number[] {
  const clue: number[] = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i]) run++;
    else if (run) {
      clue.push(run);
      run = 0;
    }
  }
  if (run) clue.push(run);
  return clue;
}

export function rowClues(grid: boolean[][]): number[][] {
  return grid.map((r) => lineClue(r));
}

export function colClues(grid: boolean[][]): number[][] {
  const n = grid.length ? grid[0].length : 0;
  const out: number[][] = [];
  for (let c = 0; c < n; c++) out.push(lineClue(grid.map((r) => r[c])));
  return out;
}

export function cluesEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function gridFromStrings(rows: string[]): boolean[][] {
  return rows.map((r) => Array.from(r, (ch) => ch === '1'));
}

export function gridToStrings(grid: boolean[][]): string[] {
  return grid.map((r) => r.map((b) => (b ? '1' : '0')).join(''));
}

/** Minimum length required by a clue (blocks + single gaps). */
export function clueMinLength(clue: number[]): number {
  return clue.reduce((a, b) => a + b, 0) + Math.max(0, clue.length - 1);
}

/** Do the supplied clues describe a well-formed puzzle (every clue fits, totals agree)? */
export function validateClues(rows: number[][], cols: number[][]): boolean {
  const sum = (c: number[][]) => c.reduce((a, l) => a + l.reduce((x, y) => x + y, 0), 0);
  if (sum(rows) !== sum(cols)) return false;
  if (rows.some((c) => c.some((v) => v < 1) || clueMinLength(c) > cols.length)) return false;
  if (cols.some((c) => c.some((v) => v < 1) || clueMinLength(c) > rows.length)) return false;
  return true;
}
