# Nonogram Master

React + TypeScript + Vite nonogram game. Runs offline in any modern browser (PC / tablet / phone).

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine, progression, storage, i18n and UI tests
npm run build        # type-check + production build into dist/
npm run gen:puzzles  # rebuild src/data/catalog.generated.json (verifies every puzzle)
```

## Structure
- `src/engine/` – pure puzzle logic, no UI: clues, exact line solver, uniqueness check, game state machine (undo/redo/hint), seeded daily generator, art scenes.
- `src/store/` – save data, localStorage persistence, XP / levels / achievements (pure functions) and the React store.
- `src/i18n/` – dictionaries (`en.ts` is the key source, `ko.ts`). Add a language by adding a file and registering it in `i18n/index.ts`.
- `src/services/` – audio (WebAudio, no assets), haptics, and `ads.ts` (no-op ad layer with hooks for interstitial / rewarded / unlock and an `adFree` flag).
- `src/screens/`, `src/components/` – UI.

## Puzzle guarantees
Every catalog puzzle is built from a pixel-art scene and kept only if it is **solvable by pure line logic**, which proves the solution is unique. Tests re-verify this for all puzzles (plus an independent brute-force counter for 5×5 and 10×10) and for 60 consecutive daily puzzles.
Daily puzzles are generated from the UTC date key with a seeded PRNG (integer math only), so every player gets the same puzzle.

## Ads
`AD_CONFIG.enabled` is `false`. To integrate an SDK, implement `AdService` and call `setAdService`; the UI hooks already exist.
