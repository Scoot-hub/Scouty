import { useSyncExternalStore, useCallback } from 'react';

const STORAGE_KEY = 'scouthub-utc-offset';

function getLocalUtcOffset(): number {
  return -Math.round(new Date().getTimezoneOffset() / 60);
}

function getSnapshot(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return getLocalUtcOffset();
  const n = Number(raw);
  return Number.isFinite(n) ? n : getLocalUtcOffset();
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setUtcOffset(offset: number) {
  localStorage.setItem(STORAGE_KEY, String(offset));
  for (const cb of listeners) cb();
}

export function useUtcOffset() {
  const utcOffset = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useCallback((offset: number) => setUtcOffset(offset), []);
  return { utcOffset, setUtcOffset: set, getLocalUtcOffset };
}

export function formatTimeWithOffset(time: string | null, utcOffset = 0): string {
  if (!time) return '';
  const hh = parseInt(time.slice(0, 2), 10);
  const mm = time.slice(3, 5);
  if (utcOffset === 0) return `${String(hh).padStart(2, '0')}:${mm}`;
  let adjusted = hh + utcOffset;
  if (adjusted < 0) adjusted += 24;
  if (adjusted >= 24) adjusted -= 24;
  return `${String(adjusted).padStart(2, '0')}:${mm}`;
}
