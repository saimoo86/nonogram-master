/** Tiny WebAudio synth: sound effects and a gentle generative background loop. No asset files needed. */

type Sfx = 'fill' | 'x' | 'erase' | 'error' | 'hint' | 'complete' | 'achievement' | 'click';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicTimer: number | null = null;
let musicStep = 0;
let sfxOn = true;

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, dest?: AudioNode) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g);
  g.connect(dest ?? master);
  o.start(start);
  o.stop(start + dur + 0.05);
}

export function setSfxEnabled(on: boolean) {
  sfxOn = on;
}

export function playSfx(kind: Sfx) {
  if (!sfxOn) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  switch (kind) {
    case 'fill': tone(520, t, 0.09, 'triangle', 0.18); break;
    case 'x': tone(300, t, 0.08, 'square', 0.07); break;
    case 'erase': tone(400, t, 0.06, 'sine', 0.1); break;
    case 'click': tone(660, t, 0.05, 'sine', 0.1); break;
    case 'error': tone(150, t, 0.18, 'sawtooth', 0.12); break;
    case 'hint': tone(740, t, 0.1, 'sine', 0.15); tone(988, t + 0.09, 0.14, 'sine', 0.15); break;
    case 'complete': [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.12, 0.3, 'triangle', 0.2)); break;
    case 'achievement': [784, 988, 1175, 1568].forEach((f, i) => tone(f, t + i * 0.09, 0.35, 'sine', 0.16)); break;
  }
}

const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33]; // C major pentatonic-ish

function musicTick() {
  if (!ctx || !master) return;
  const t = ctx.currentTime + 0.05;
  const bar = Math.floor(musicStep / 8);
  const root = [0, 3, 4, 2][bar % 4];
  if (musicStep % 8 === 0) {
    tone(SCALE[root] / 2, t, 2.0, 'sine', 0.05);
    tone(SCALE[(root + 2) % 7] / 2, t, 2.0, 'sine', 0.035);
  }
  if (musicStep % 2 === 0 || musicStep % 8 === 5) {
    const n = SCALE[(root + [0, 2, 4, 1, 3, 2][(musicStep >> 1) % 6]) % 7];
    tone(n, t, 0.7, 'triangle', 0.04);
  }
  musicStep++;
}

export function setMusicEnabled(on: boolean) {
  if (on) {
    if (musicTimer !== null) return;
    if (!ensure()) return;
    musicTimer = window.setInterval(musicTick, 420);
  } else if (musicTimer !== null) {
    window.clearInterval(musicTimer);
    musicTimer = null;
  }
}

/** Browsers block audio until a gesture; call from a first pointer/key event. */
export function unlockAudio() {
  ensure();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else void ctx.resume().catch(() => {});
  });
}
