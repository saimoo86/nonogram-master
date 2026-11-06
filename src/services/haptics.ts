let enabled = true;

export const vibrationSupported = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function setVibrationEnabled(on: boolean) {
  enabled = on;
}

export function vibrate(pattern: number | number[]) {
  if (!enabled || !vibrationSupported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
