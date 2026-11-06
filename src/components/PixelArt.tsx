import { useEffect, useRef } from 'react';
import type { PuzzleData } from '../engine/types';

interface Props {
  data: PuzzleData;
  locked?: boolean;
  size?: number; // css px
  className?: string;
  label?: string;
}

/** Crisp pixel-art renderer. Locked art is drawn as a flat silhouette. */
export function PixelArt({ data, locked = false, size = 96, className = '', label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const n = data.size;
    cv.width = n;
    cv.height = n;
    ctx.clearRect(0, 0, n, n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const ch = data.colors[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = locked ? '#8d92ad' : data.palette[parseInt(ch, 36)];
        ctx.fillRect(c, r, 1, 1);
      }
    }
  }, [data, locked]);
  return (
    <canvas
      ref={ref}
      className={`pixel-art${locked ? ' locked' : ''} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? (locked ? 'locked' : data.sceneId)}
      data-testid={locked ? 'art-locked' : 'art-unlocked'}
    />
  );
}
