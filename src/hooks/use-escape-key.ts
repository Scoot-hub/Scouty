import { useEffect } from 'react';

/**
 * Calls `handler` when Escape is pressed, but only when `enabled` is true.
 * Cleans up automatically when enabled becomes false or component unmounts.
 */
export function useEscapeKey(handler: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, handler]);
}
