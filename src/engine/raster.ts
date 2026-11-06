/** Vector-ish scene description rasterized to a pixel grid (used to build puzzle art). */

export type Color = string | null; // null = erase

export type Shape =
  | { t: 'e'; cx: number; cy: number; rx: number; ry: number; c: Color }
  | { t: 'r'; x: number; y: number; w: number; h: number; c: Color }
  | { t: 'p'; pts: [number, number][]; c: Color }
  | { t: 'l'; x1: number; y1: number; x2: number; y2: number; r: number; c: Color };

export const E = (cx: number, cy: number, rx: number, ry: number, c: Color): Shape => ({ t: 'e', cx, cy, rx, ry, c });
export const R = (x: number, y: number, w: number, h: number, c: Color): Shape => ({ t: 'r', x, y, w, h, c });
export const P = (pts: [number, number][], c: Color): Shape => ({ t: 'p', pts, c });
export const L = (x1: number, y1: number, x2: number, y2: number, r: number, c: Color): Shape => ({ t: 'l', x1, y1, x2, y2, r, c });

export interface Transform {
  dx: number;
  dy: number;
  s: number;
}

function inside(sh: Shape, x: number, y: number): boolean {
  switch (sh.t) {
    case 'e': {
      const a = (x - sh.cx) / sh.rx;
      const b = (y - sh.cy) / sh.ry;
      return a * a + b * b <= 1;
    }
    case 'r':
      return x >= sh.x && x <= sh.x + sh.w && y >= sh.y && y <= sh.y + sh.h;
    case 'p': {
      let c = false;
      const p = sh.pts;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i];
        const [xj, yj] = p[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    }
    case 'l': {
      const vx = sh.x2 - sh.x1;
      const vy = sh.y2 - sh.y1;
      const len2 = vx * vx + vy * vy;
      let t = len2 === 0 ? 0 : ((x - sh.x1) * vx + (y - sh.y1) * vy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = sh.x1 + t * vx - x;
      const py = sh.y1 + t * vy - y;
      return px * px + py * py <= sh.r * sh.r;
    }
  }
}

/** Rasterize shapes onto an n×n grid sampling cell centers. */
export function rasterize(shapes: Shape[], n: number, tf: Transform = { dx: 0, dy: 0, s: 1 }): Color[][] {
  const out: Color[][] = [];
  for (let r = 0; r < n; r++) {
    const row: Color[] = [];
    for (let c = 0; c < n; c++) {
      const x = ((c + 0.5) / n - 0.5 - tf.dx) / tf.s + 0.5;
      const y = ((r + 0.5) / n - 0.5 - tf.dy) / tf.s + 0.5;
      let col: Color = null;
      for (const sh of shapes) if (inside(sh, x, y)) col = sh.c;
      row.push(col);
    }
    out.push(row);
  }
  return out;
}
