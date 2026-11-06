import { colClues, gridToStrings, rowClues } from './clues';
import { E, R, rasterize, type Color, type Shape, type Transform } from './raster';
import { hashString, mulberry32 } from './rng';
import { propagate } from './solver';
import { DIFF_OF_SIZE, type PuzzleData } from './types';
import type { Scene } from './scenes';

export interface Candidate {
  colors: Color[][];
  sweeps: number;
}

export function filled(colors: Color[][]): boolean[][] {
  return colors.map((r) => r.map((c) => c !== null));
}

/** Returns sweeps if the picture is solvable by line logic alone (=> unique solution), else null. */
export function logicSweeps(colors: Color[][]): number | null {
  const g = filled(colors);
  const res = propagate(rowClues(g), colClues(g));
  return res.solved ? res.sweeps : null;
}

function ratioOk(colors: Color[][], n: number): boolean {
  const total = n * n;
  let f = 0;
  for (const r of colors) for (const c of r) if (c !== null) f++;
  const lo = n <= 5 ? 0.3 : 0.2;
  const hi = n <= 5 ? 0.88 : 0.82;
  return f / total >= lo && f / total <= hi;
}

const TRANSFORMS: Transform[] = (() => {
  const out: Transform[] = [{ dx: 0, dy: 0, s: 1 }];
  const ss = [1, 0.96, 1.04, 0.92, 1.08, 0.88, 1.12, 0.84];
  const ds = [0, 0.02, -0.02, 0.04, -0.04, 0.06, -0.06];
  for (const s of ss) for (const dx of ds) for (const dy of ds) if (!(s === 1 && dx === 0 && dy === 0)) out.push({ dx, dy, s });
  return out;
})();

/** Try to rasterize `scene` at size n so that the result is uniquely, logically solvable. */
export function artFromScene(scene: Scene, n: number): Candidate | null {
  const base = rasterize(scene.shapes, n);
  // 1) pure transforms of the original art; pick the logical depth that suits the tier
  const found: Candidate[] = [];
  for (const tf of TRANSFORMS) {
    const colors = tf === TRANSFORMS[0] ? base : rasterize(scene.shapes, n, tf);
    if (!ratioOk(colors, n)) continue;
    const sw = logicSweeps(colors);
    if (sw !== null) found.push({ colors, sweeps: sw });
  }
  if (found.length) {
    found.sort((x, y) => x.sweeps - y.sweeps);
    const q = ({ 5: 0, 10: 0.5, 15: 0.8, 20: 1, 25: 1 } as Record<number, number>)[n] ?? 0.5;
    return found[Math.min(found.length - 1, Math.floor(q * found.length))];
  }
  // 1b) mirrored variants of the same art
  for (const tf of TRANSFORMS) {
    const colors = rasterize(scene.shapes, n, tf).map((row) => row.slice().reverse());
    if (!ratioOk(colors, n)) continue;
    const sw = logicSweeps(colors);
    if (sw !== null) return { colors, sweeps: sw };
  }
  // 2) minimal pixel edits (1..2 cells) on the original art
  const rng = mulberry32(hashString('fix-' + scene.id + n));
  const palette = Array.from(new Set(base.flat().filter((c): c is string => c !== null)));
  const flip = (colors: Color[][], r: number, c: number): Color[][] => {
    const cp = colors.map((row) => row.slice());
    if (cp[r][c] !== null) cp[r][c] = null;
    else {
      const nb: Color[] = [];
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const v = colors[r + dr]?.[c + dc];
        if (v) nb.push(v);
      }
      cp[r][c] = nb[0] ?? palette[0];
    }
    return cp;
  };
  const cells: [number, number][] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells.push([r, c]);
  const shuffled = cells.slice().sort(() => rng() - 0.5);
  for (const [r, c] of shuffled) {
    const one = flip(base, r, c);
    const sw = ratioOk(one, n) ? logicSweeps(one) : null;
    if (sw !== null) return { colors: one, sweeps: sw };
  }
  for (let t = 0; t < 4000; t++) {
    const [r1, c1] = shuffled[Math.floor(rng() * shuffled.length)];
    const [r2, c2] = shuffled[Math.floor(rng() * shuffled.length)];
    if (r1 === r2 && c1 === c2) continue;
    const two = flip(flip(base, r1, c1), r2, c2);
    if (!ratioOk(two, n)) continue;
    const sw = logicSweeps(two);
    if (sw !== null) return { colors: two, sweeps: sw };
  }
  // 3) up to 4 random edits
  for (let t = 0; t < 4000; t++) {
    let g = base;
    for (let k = 0; k < 4; k++) {
      const [r, c] = shuffled[Math.floor(rng() * shuffled.length)];
      g = flip(g, r, c);
    }
    if (!ratioOk(g, n)) continue;
    const sw = logicSweeps(g);
    if (sw !== null) return { colors: g, sweeps: sw };
  }
  // 4) heavier edits as a last resort
  for (let t = 0; t < 30000; t++) {
    let g = base;
    const k = 5 + Math.floor(rng() * 8);
    for (let i = 0; i < k; i++) {
      const [r, c] = shuffled[Math.floor(rng() * shuffled.length)];
      g = flip(g, r, c);
    }
    if (!ratioOk(g, n)) continue;
    const sw = logicSweeps(g);
    if (sw !== null) return { colors: g, sweeps: sw };
  }
  return null;
}

/** Convert a color grid to the serializable PuzzleData fields. */
export function packColors(colors: Color[][]): { solution: string[]; colors: string[]; palette: string[] } {
  const palette: string[] = [];
  const rows = colors.map((row) =>
    row
      .map((c) => {
        if (c === null) return '.';
        let i = palette.indexOf(c);
        if (i < 0) {
          palette.push(c);
          i = palette.length - 1;
        }
        return i.toString(36);
      })
      .join(''),
  );
  return { solution: gridToStrings(filled(colors)), colors: rows, palette };
}

export function unpackColors(data: Pick<PuzzleData, 'colors' | 'palette'>): Color[][] {
  return data.colors.map((row) => Array.from(row, (ch) => (ch === '.' ? null : data.palette[parseInt(ch, 36)])));
}

// ---------------------------------------------------------------------------
// Daily puzzle: deterministic random art from the date key.
// Only +,-,*,/ and comparisons are used so every platform produces identical output.
// ---------------------------------------------------------------------------

const DAILY_PALETTES: string[][] = [
  ['#e17055', '#fdcb6e', '#6c5ce7', '#00b894'],
  ['#0984e3', '#74b9ff', '#ffeaa7', '#d63031'],
  ['#e84393', '#fd79a8', '#a29bfe', '#55efc4'],
  ['#2d6a4f', '#95d5b2', '#f4a261', '#e76f51'],
  ['#6c5ce7', '#81ecec', '#fab1a0', '#ffeaa7'],
  ['#d63031', '#fdcb6e', '#2d3436', '#dfe6e9'],
];

export function dailySizeFor(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return [15, 10, 10, 15, 10, 15, 20][dow];
}

function randomShapes(rng: () => number, palette: string[]): Shape[] {
  const q = (v: number) => Math.round(v * 100) / 100;
  const shapes: Shape[] = [];
  const count = 4 + Math.floor(rng() * 4);
  const mirror = rng() < 0.75;
  for (let i = 0; i < count; i++) {
    const color: Color = rng() < 0.12 && i > 1 ? null : palette[Math.floor(rng() * palette.length)];
    const cx = q(0.15 + rng() * 0.7);
    const cy = q(0.12 + rng() * 0.76);
    const a = q(0.08 + rng() * 0.26);
    const b = q(0.08 + rng() * 0.26);
    if (rng() < 0.55) {
      shapes.push(E(cx, cy, a, b, color));
      if (mirror) shapes.push(E(q(1 - cx), cy, a, b, color));
    } else {
      const x = q(cx - a);
      shapes.push(R(x, q(cy - b), q(2 * a), q(2 * b), color));
      if (mirror) shapes.push(R(q(1 - x - 2 * a), q(cy - b), q(2 * a), q(2 * b), color));
    }
  }
  return shapes;
}

export function generateDaily(dateKey: string): PuzzleData {
  const size = dailySizeFor(dateKey);
  const rng = mulberry32(hashString('nonogram-master-daily-v1-' + dateKey));
  const palette = DAILY_PALETTES[Math.floor(rng() * DAILY_PALETTES.length)];
  let best: Candidate | null = null;
  for (let attempt = 0; attempt < 400 && !best; attempt++) {
    const colors = rasterize(randomShapes(rng, palette), size);
    if (!ratioOk(colors, size)) continue;
    const sw = logicSweeps(colors);
    if (sw !== null) best = { colors, sweeps: sw };
  }
  if (!best) {
    // Extremely unlikely fallback: fully deterministic hand-made pattern that is logic-solvable.
    const colors: Color[][] = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => ((r * 7 + c * 3 + r * c) % 5 < 3 ? palette[(r + c) % palette.length] : null)),
    );
    const sw = logicSweeps(colors);
    best = { colors, sweeps: sw ?? 0 };
  }
  const packed = packColors(best.colors);
  return {
    id: 'daily-' + dateKey,
    sceneId: 'daily',
    theme: 'daily',
    size,
    difficulty: DIFF_OF_SIZE[size],
    ...packed,
    sweeps: best.sweeps,
    stars: Math.min(5, Math.max(1, Math.round(best.sweeps / 2))),
  };
}
