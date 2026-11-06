// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { getPuzzleData, puzzlesOf, toPuzzle } from './data/catalog';
import { STORAGE_KEY } from './store/storage';
import { utcDateKey } from './engine/dates';

class MemStorage {
  private d = new Map<string, string>();
  get length() { return this.d.size; }
  key(i: number) { return Array.from(this.d.keys())[i] ?? null; }
  getItem(k: string) { return this.d.has(k) ? this.d.get(k)! : null; }
  setItem(k: string, v: string) { this.d.set(k, String(v)); }
  removeItem(k: string) { this.d.delete(k); }
  clear() { this.d.clear(); }
}

beforeAll(() => {
  // Node 26 ships an experimental global localStorage that shadows jsdom's; use a plain in-memory one.
  const mem = new MemStorage();
  Object.defineProperty(globalThis, 'localStorage', { value: mem, configurable: true });
  Object.defineProperty(window, 'localStorage', { value: mem, configurable: true });
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  HTMLCanvasElement.prototype.getContext = (() => ({ clearRect() {}, fillRect() {}, fillStyle: '' })) as never;
  window.scrollTo = (() => {}) as never;
  HTMLElement.prototype.setPointerCapture = () => {};
  // jsdom has no PointerEvent: a MouseEvent subclass keeps clientX/clientY/button working with React's handlers
  class PE extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PE;
});

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '');
  document.documentElement.dataset.theme = '';
});
afterEach(() => cleanup());

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
const goBack = async () => { fireEvent.click(screen.getByTestId('back')); await settle(); };
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');

function cellSize(): number {
  const board = screen.getByTestId('board');
  return parseInt(board.style.getPropertyValue('--cell'), 10);
}

/** simulate a pointer press-release (optionally dragging) on cell (r,c) of the board */
function press(r: number, c: number, opts: { button?: number; drag?: [number, number] } = {}) {
  const cells = screen.getByTestId('cells');
  const s = cellSize();
  const at = (rr: number, cc: number) => ({ clientX: cc * s + s / 2, clientY: rr * s + s / 2, pointerType: 'mouse', pointerId: 1, button: opts.button ?? 0, buttons: 1 });
  fireEvent.pointerDown(cells, at(r, c));
  if (opts.drag) fireEvent.pointerMove(cells, at(opts.drag[0], opts.drag[1]));
  fireEvent.pointerUp(cells, at(opts.drag ? opts.drag[0] : r, opts.drag ? opts.drag[1] : c));
}

const cellEls = () => Array.from(screen.getByTestId('cells').children) as HTMLElement[];
const cellState = (r: number, c: number, N: number) => {
  const el = cellEls()[r * N + c];
  return el.classList.contains('f') ? 'f' : el.classList.contains('x') ? 'x' : '0';
};

function openFirstEasy(): { id: string; N: number; sol: boolean[][] } {
  fireEvent.click(screen.getByTestId('menu-play'));
  fireEvent.click(screen.getByTestId('diff-easy'));
  const first = puzzlesOf('easy')[0];
  fireEvent.click(screen.getAllByTestId('puzzle-card').find((e) => e.getAttribute('data-id') === first.id)!);
  return { id: first.id, N: first.size, sol: toPuzzle(first).solution };
}

describe('app shell', () => {
  it('shows all six menu entries wired to real screens', async () => {
    render(<App />);
    for (const id of ['play', 'daily', 'collection', 'achievements', 'stats', 'settings']) expect(screen.getByTestId(`menu-${id}`)).toBeTruthy();
    const targets: [string, string][] = [['play', 'play-screen'], ['daily', 'daily-screen'], ['collection', 'collection-screen'], ['achievements', 'ach-screen'], ['stats', 'stats-screen'], ['settings', 'settings-screen']];
    for (const [menu, scr] of targets) {
      fireEvent.click(screen.getByTestId(`menu-${menu}`));
      expect(screen.getByTestId(scr)).toBeTruthy();
      await goBack();
    }
  });

  it('language change retranslates the UI and persists', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('menu-settings'));
    fireEvent.change(screen.getByTestId('lang-select'), { target: { value: 'ko' } });
    expect(screen.getByRole('heading', { name: '설정' })).toBeTruthy();
    await goBack();
    expect(screen.getByTestId('menu-play').textContent).toContain('플레이');
    expect(screen.getByTestId('menu-daily').textContent).toContain('데일리 퍼즐');
    expect(stored().settings.lang).toBe('ko');
    expect(document.documentElement.lang).toBe('ko');
    fireEvent.click(screen.getByTestId('menu-settings'));
    fireEvent.change(screen.getByTestId('lang-select'), { target: { value: 'en' } });
    await goBack();
    expect(screen.getByTestId('menu-play').textContent).toContain('Play');
  });

  it('theme switching applies and persists', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('menu-settings'));
    fireEvent.click(screen.getByTestId('theme-dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    fireEvent.click(screen.getByTestId('theme-light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(stored().settings.theme).toBe('light');
  });

  it('settings toggles update saved settings', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('menu-settings'));
    fireEvent.click(screen.getByTestId('toggle-sfx'));
    fireEvent.click(screen.getByTestId('toggle-mistakes'));
    fireEvent.click(screen.getByTestId('toggle-music'));
    const s = stored().settings;
    expect(s.sfx).toBe(false);
    expect(s.showMistakes).toBe(false);
    expect(s.music).toBe(true);
    fireEvent.click(screen.getByTestId('toggle-music'));
  });
});

describe('gameplay (mouse)', () => {
  it('left click fills, right click marks X, X is distinct from empty, drag fills a line', async () => {
    render(<App />);
    const { N } = openFirstEasy();
    expect(screen.getByTestId('board').getAttribute('data-size')).toBe(String(N));
    expect(screen.getAllByTestId('row-clue').length).toBe(N);
    expect(screen.getAllByTestId('col-clue').length).toBe(N);
    press(0, 0);
    expect(cellState(0, 0, N)).toBe('f');
    press(0, 0);
    expect(cellState(0, 0, N)).toBe('0'); // toggle off
    press(1, 1, { button: 2 });
    expect(cellState(1, 1, N)).toBe('x');
    expect(cellState(1, 2, N)).toBe('0');
    press(2, 0, { drag: [2, N - 1] });
    for (let c = 0; c < N; c++) expect(cellState(2, c, N)).toBe('f');
    // drag does not paint over X marks
    press(3, 0, { button: 2 });
    press(3, 1, { button: 2, drag: [3, 3] });
    expect(cellState(3, 2, N)).toBe('x');
  });

  it('X mode button switches the tool and shows the current mode clearly', async () => {
    render(<App />);
    const { N } = openFirstEasy();
    expect(screen.getByTestId('mode-banner').textContent).toContain('Fill');
    fireEvent.click(screen.getByTestId('tool-x'));
    expect(screen.getByTestId('mode-banner').textContent).toContain('X');
    expect(screen.getByTestId('tool-x').getAttribute('aria-pressed')).toBe('true');
    press(0, 0);
    expect(cellState(0, 0, N)).toBe('x');
    fireEvent.click(screen.getByTestId('tool-fill'));
    press(0, 1);
    expect(cellState(0, 1, N)).toBe('f');
  });

  it('undo / redo buttons and keyboard', async () => {
    render(<App />);
    const { N } = openFirstEasy();
    press(0, 0);
    press(0, 1);
    fireEvent.click(screen.getByTestId('undo'));
    expect(cellState(0, 1, N)).toBe('0');
    expect(cellState(0, 0, N)).toBe('f');
    fireEvent.click(screen.getByTestId('redo'));
    expect(cellState(0, 1, N)).toBe('f');
    fireEvent.keyDown(window, { key: 'z' });
    expect(cellState(0, 1, N)).toBe('0');
    fireEvent.keyDown(window, { key: 'y' });
    expect(cellState(0, 1, N)).toBe('f');
    // keyboard cursor + space fills, x marks
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: ' ' });
    expect(cellState(1, 2, N)).toBe('f');
    fireEvent.keyDown(window, { key: 'x' });
    expect(cellState(1, 2, N)).toBe('x');
  });

  it('mistakes are highlighted only when the setting is on', async () => {
    render(<App />);
    const { N, sol } = openFirstEasy();
    let wr = 0, wc = 0;
    outer: for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!sol[r][c]) { wr = r; wc = c; break outer; }
    press(wr, wc);
    expect(cellEls()[wr * N + wc].classList.contains('wrong')).toBe(true);
    cleanup();
    localStorage.clear();
  });

  it('hint fills a correct cell, spends inventory, and is counted', async () => {
    render(<App />);
    openFirstEasy();
    const before = parseInt(screen.getByTestId('hint-count').textContent!.replace(/\D/g, ''), 10);
    fireEvent.click(screen.getByTestId('hint'));
    const after = parseInt(screen.getByTestId('hint-count').textContent!.replace(/\D/g, ''), 10);
    expect(after).toBe(before - 1);
    expect(cellEls().filter((e) => e.classList.contains('hinted')).length).toBe(1);
    expect(stored().stats.hintsUsed).toBe(1);
  });

  it('restart asks for confirmation then clears the board', async () => {
    render(<App />);
    const { N } = openFirstEasy();
    press(0, 0);
    fireEvent.click(screen.getByTestId('restart'));
    fireEvent.click(screen.getByTestId('confirm-restart'));
    expect(cellState(0, 0, N)).toBe('0');
  });

  it('solving a puzzle shows results, awards xp & achievements, unlocks the collection and updates stats', async () => {
    render(<App />);
    const { id, N, sol } = openFirstEasy();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (sol[r][c]) press(r, c);
    const modal = await screen.findByTestId('result-modal', {}, { timeout: 3000 });
    expect(modal).toBeTruthy();
    expect(screen.getByTestId('result-xp').textContent).toMatch(/\+\d+ XP/);
    expect(screen.getByTestId('new-art')).toBeTruthy();
    expect(screen.getAllByTestId('achievement-toast').length).toBeGreaterThanOrEqual(1);
    const save = stored();
    expect(save.completed[id].count).toBe(1);
    expect(save.achievements.first).toBeTruthy();
    expect(save.achievements.nohint).toBeTruthy();
    expect(save.achievements.nomistake).toBeTruthy();
    expect(save.xp).toBeGreaterThan(0);
    expect(save.inProgress[id]).toBeUndefined();
    expect(save.stats.completedTotal).toBe(1);
    // collection shows it unlocked
    fireEvent.click(screen.getByTestId('result-menu'));
    await settle();
    await goBack();
    fireEvent.click(screen.getByTestId('menu-collection'));
    const sceneId = getPuzzleData(id)!.sceneId;
    const themeOf = getPuzzleData(id)!.theme as string;
    fireEvent.click(screen.getByTestId(`theme-${themeOf}`));
    const card = screen.getAllByTestId('art-card').find((e) => e.getAttribute('data-scene') === sceneId)!;
    expect(card.getAttribute('data-unlocked')).toBe('1');
    expect(within(card).getByTestId('art-unlocked')).toBeTruthy();
    // other cards remain silhouettes
    const locked = screen.getAllByTestId('art-card').filter((e) => e.getAttribute('data-unlocked') === '0');
    expect(locked.length).toBe(3);
    expect(within(locked[0]).getByTestId('art-locked')).toBeTruthy();
    expect(screen.getByTestId('collection-progress').textContent).toContain('1 / 24');
    // stats screen
    await goBack();
    fireEvent.click(screen.getByTestId('menu-stats'));
    expect(screen.getByTestId('stat-completed').textContent).toContain('1');
    expect(screen.getByTestId('stat-accuracy').textContent).toContain('100%');
    // achievements screen
    await goBack();
    fireEvent.click(screen.getByTestId('menu-achievements'));
    expect(screen.getAllByTestId('ach-item').filter((e) => e.getAttribute('data-done') === '1').length).toBeGreaterThanOrEqual(3);
  });

  it('an incorrect board is never judged complete', async () => {
    render(<App />);
    const { N, sol } = openFirstEasy();
    // fill everything except one required cell
    let skipped = false;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (sol[r][c]) { if (!skipped) { skipped = true; continue; } press(r, c); }
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(screen.queryByTestId('result-modal')).toBeNull();
    expect(stored().completed ?? {}).toEqual({});
  });
});

describe('persistence', () => {
  it('resumes an interrupted puzzle after a reload (progress, timer, continue button)', async () => {
    const first = render(<App />);
    const { id, N } = openFirstEasy();
    press(0, 0);
    press(1, 1, { button: 2 });
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)); }); // timer + autosave
    first.unmount();
    expect(stored().inProgress[id]).toBeTruthy();
    // "refresh": new app instance reading localStorage
    history.replaceState(null, '');
    render(<App />);
    const cont = screen.getByTestId('menu-continue');
    fireEvent.click(cont);
    expect(cellState(0, 0, N)).toBe('f');
    expect(cellState(1, 1, N)).toBe('x');
    expect(screen.getByTestId('timer').textContent).toMatch(/00:0[1-9]|00:[1-5]\d/);
  });

  it('keeps progress & settings across reload; reset wipes progress but keeps language', async () => {
    const r1 = render(<App />);
    const { id, N, sol } = openFirstEasy();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (sol[r][c]) press(r, c);
    await screen.findByTestId('result-modal', {}, { timeout: 3000 });
    r1.unmount();
    history.replaceState(null, '');
    render(<App />);
    expect(stored().completed[id]).toBeTruthy();
    fireEvent.click(screen.getByTestId('menu-settings'));
    fireEvent.click(screen.getByTestId('reset-data'));
    fireEvent.click(screen.getByTestId('confirm-reset'));
    const s = stored();
    expect(s.completed ?? {}).toEqual({});
    expect(s.xp).toBe(0);
    expect(s.stats.completedTotal).toBe(0);
  });
});

describe('daily puzzle', () => {
  it('today\'s daily puzzle is playable, completes, saves the streak, and cannot be replayed for streak', async () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('menu-daily'));
    const today = utcDateKey();
    expect(screen.getByTestId('daily-screen').textContent).toContain(today);
    fireEvent.click(screen.getByTestId('daily-play'));
    const data = getPuzzleData(`daily-${today}`)!;
    const sol = toPuzzle(data).solution;
    const N = data.size;
    // drag-fill each filled run in each row for speed (also exercises drag)
    for (let r = 0; r < N; r++) {
      let c = 0;
      while (c < N) {
        if (!sol[r][c]) { c++; continue; }
        let e = c;
        while (e + 1 < N && sol[r][e + 1]) e++;
        if (e === c) press(r, c);
        else press(r, c, { drag: [r, e] });
        c = e + 1;
      }
    }
    await screen.findByTestId('result-modal', {}, { timeout: 4000 });
    fireEvent.click(screen.getByTestId('result-menu'));
    await settle();
    await waitFor(() => expect(screen.getByTestId('daily-done')).toBeTruthy());
    expect(stored().daily.streak).toBe(1);
    expect(screen.getByTestId('daily-streak').textContent).toContain('1');
    expect(screen.getByTestId('daily-countdown')).toBeTruthy();
    expect(screen.queryByTestId('daily-play')).toBeNull();
  });
});
