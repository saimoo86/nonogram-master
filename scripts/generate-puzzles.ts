/* Builds src/data/catalog.generated.json — every puzzle is verified to be solvable by pure line logic,
 * which guarantees a unique solution. Run: npm run gen:puzzles */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { artFromScene, packColors } from '../src/engine/generator';
import { SCENES } from '../src/engine/scenes';
import { DIFF_OF_SIZE, SIZE_OF, DIFFICULTIES, type PuzzleData } from '../src/engine/types';

const out: PuzzleData[] = [];
const missing: string[] = [];
for (const scene of SCENES) {
  for (const d of DIFFICULTIES) {
    const n = SIZE_OF[d];
    const t = Date.now();
    const cand = artFromScene(scene, n);
    if (!cand) {
      missing.push(`${scene.id}-${n}`);
      continue;
    }
    const packed = packColors(cand.colors);
    out.push({
      id: `${scene.id}-${n}`,
      sceneId: scene.id,
      theme: scene.theme,
      size: n,
      difficulty: DIFF_OF_SIZE[n],
      ...packed,
      sweeps: cand.sweeps,
      stars: 1,
    });
    process.stdout.write(`${scene.id}-${n} sweeps=${cand.sweeps} (${Date.now() - t}ms)\n`);
  }
}
// relative star rating per tier by sweep quantiles
for (const d of DIFFICULTIES) {
  const tier = out.filter((p) => p.difficulty === d).sort((a, b) => a.sweeps - b.sweeps);
  tier.forEach((p, i) => {
    p.stars = 1 + Math.min(4, Math.floor((i / tier.length) * 5));
  });
}
out.sort((a, b) => a.size - b.size || a.sweeps - b.sweeps || a.id.localeCompare(b.id));
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, '../src/data/catalog.generated.json'), JSON.stringify(out));
console.log(`\nwrote ${out.length} puzzles; missing: ${missing.join(', ') || 'none'}`);
for (const d of DIFFICULTIES) {
  const t = out.filter((p) => p.difficulty === d);
  console.log(d, t.length, 'avg sweeps', (t.reduce((a, p) => a + p.sweeps, 0) / Math.max(1, t.length)).toFixed(2));
}
