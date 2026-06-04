import { createContext, useContext, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';

import type { DateFormat, TimeFormat } from '@/lib/format-utils';

interface UiPreferences {
  reducedVisionMode: boolean;
  showNotifications: boolean;
  showChatbot: boolean;
  hideRestrictedElements: boolean;
  weekStartDay: 0 | 1; // 0 = Sunday, 1 = Monday
  distanceUnit: 'km' | 'mi';
  timezone: string;
  currency: string;       // ISO 4217 code, e.g. 'EUR', 'USD'
  dateFormat: DateFormat; // 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timeFormat: TimeFormat; // '24h' | '12h'
  /** When true, the News page auto-translates foreign-language articles into
   *  the active UI language (uses cached translations in the listing and
   *  fires a fresh translation when an article is opened). */
  autoTranslateNews: boolean;
  /** When true, the page guide pop-up opens automatically on first visit to
   *  each page that has a guide. Set to false to disable autonomous opening. */
  autoShowGuide: boolean;
  // ── Player card display ──────────────────────────────────────────────────
  showPlayerPhotos: boolean;
  showPlayerClub: boolean;
  showPlayerLeague: boolean;
  showPlayerLevel: boolean;
  showPlayerPotential: boolean;
  showPlayerCompletion: boolean;
  // ── Animations ───────────────────────────────────────────────────────────
  /** When false, decorative animations (pulse, ping, reveal) are disabled. Persisted in DB. */
  animationsEnabled: boolean;
}

interface UiPreferencesContextType extends UiPreferences {
  setReducedVisionMode: (value: boolean) => void;
  setShowNotifications: (value: boolean) => void;
  setShowChatbot: (value: boolean) => void;
  setHideRestrictedElements: (value: boolean) => void;
  setWeekStartDay: (value: 0 | 1) => void;
  setDistanceUnit: (value: 'km' | 'mi') => void;
  setTimezone: (value: string) => void;
  setCurrency: (value: string) => void;
  setDateFormat: (value: DateFormat) => void;
  setTimeFormat: (value: TimeFormat) => void;
  setAutoTranslateNews: (value: boolean) => void;
  setAutoShowGuide: (value: boolean) => void;
  setShowPlayerPhotos: (value: boolean) => void;
  setShowPlayerClub: (value: boolean) => void;
  setShowPlayerLeague: (value: boolean) => void;
  setShowPlayerLevel: (value: boolean) => void;
  setShowPlayerPotential: (value: boolean) => void;
  setShowPlayerCompletion: (value: boolean) => void;
  setAnimationsEnabled: (value: boolean) => void;
}

const STORAGE_KEY = 'scouthub-ui-preferences';

function getBrowserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

const defaultPreferences: UiPreferences = {
  reducedVisionMode: false,
  showNotifications: true,
  showChatbot: true,
  hideRestrictedElements: false,
  weekStartDay: 1,
  distanceUnit: 'km',
  timezone: getBrowserTimezone(),
  currency: 'EUR',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  autoTranslateNews: true,
  autoShowGuide: true,
  showPlayerPhotos: true,
  showPlayerClub: true,
  showPlayerLeague: true,
  showPlayerLevel: true,
  showPlayerPotential: true,
  showPlayerCompletion: true,
  animationsEnabled: true,
};

const UiPreferencesContext = createContext<UiPreferencesContextType>({
  ...defaultPreferences,
  setReducedVisionMode: () => {},
  setShowNotifications: () => {},
  setShowChatbot: () => {},
  setHideRestrictedElements: () => {},
  setWeekStartDay: () => {},
  setDistanceUnit: () => {},
  setTimezone: () => {},
  setCurrency: () => {},
  setDateFormat: () => {},
  setTimeFormat: () => {},
  setAutoTranslateNews: () => {},
  setAutoShowGuide: () => {},
  setShowPlayerPhotos: () => {},
  setShowPlayerClub: () => {},
  setShowPlayerLeague: () => {},
  setShowPlayerLevel: () => {},
  setShowPlayerPotential: () => {},
  setShowPlayerCompletion: () => {},
  setAnimationsEnabled: () => {},
});

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UiPreferences>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultPreferences;
      const parsed = JSON.parse(raw);
      return {
        ...defaultPreferences,
        ...parsed,
        // Always fall back to browser timezone if none stored
        timezone: parsed.timezone || getBrowserTimezone(),
      };
    } catch {
      return defaultPreferences;
    }
  });

  // Track previous animationsEnabled to detect changes for server sync
  const prevAnimRef = useRef<boolean | null>(null);

  // On mount: fetch server-persisted prefs (animationsEnabled) and merge
  useEffect(() => {
    fetch('/api/my-ui-prefs', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setPreferences(prev => {
          const merged = { ...prev };
          if (typeof data.animationsEnabled === 'boolean') {
            merged.animationsEnabled = data.animationsEnabled;
          }
          return merged;
        });
        prevAnimRef.current = typeof data.animationsEnabled === 'boolean' ? data.animationsEnabled : true;
      })
      .catch(() => {/* not logged in or network error — ignore */});
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    const root = document.documentElement;
    root.classList.toggle('reduced-vision', preferences.reducedVisionMode);

    // Sync animationsEnabled to server when it changes (after initial load)
    if (prevAnimRef.current !== null && prevAnimRef.current !== preferences.animationsEnabled) {
      prevAnimRef.current = preferences.animationsEnabled;
      fetch('/api/my-ui-prefs', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ animationsEnabled: preferences.animationsEnabled }),
      }).catch(() => {});
    }
  }, [preferences]);

  const value = useMemo<UiPreferencesContextType>(() => ({
    ...preferences,
    setReducedVisionMode: (value) => setPreferences((prev) => ({ ...prev, reducedVisionMode: value })),
    setShowNotifications: (value) => setPreferences((prev) => ({ ...prev, showNotifications: value })),
    setShowChatbot: (value) => setPreferences((prev) => ({ ...prev, showChatbot: value })),
    setHideRestrictedElements: (value) => setPreferences((prev) => ({ ...prev, hideRestrictedElements: value })),
    setWeekStartDay: (value) => setPreferences((prev) => ({ ...prev, weekStartDay: value })),
    setDistanceUnit: (value) => setPreferences((prev) => ({ ...prev, distanceUnit: value })),
    setTimezone: (value) => setPreferences((prev) => ({ ...prev, timezone: value })),
    setCurrency: (value) => setPreferences((prev) => ({ ...prev, currency: value })),
    setDateFormat: (value) => setPreferences((prev) => ({ ...prev, dateFormat: value })),
    setTimeFormat: (value) => setPreferences((prev) => ({ ...prev, timeFormat: value })),
    setAutoTranslateNews: (value) => setPreferences((prev) => ({ ...prev, autoTranslateNews: value })),
    setAutoShowGuide: (value) => setPreferences((prev) => ({ ...prev, autoShowGuide: value })),
    setShowPlayerPhotos: (value) => setPreferences((prev) => ({ ...prev, showPlayerPhotos: value })),
    setShowPlayerClub: (value) => setPreferences((prev) => ({ ...prev, showPlayerClub: value })),
    setShowPlayerLeague: (value) => setPreferences((prev) => ({ ...prev, showPlayerLeague: value })),
    setShowPlayerLevel: (value) => setPreferences((prev) => ({ ...prev, showPlayerLevel: value })),
    setShowPlayerPotential: (value) => setPreferences((prev) => ({ ...prev, showPlayerPotential: value })),
    setShowPlayerCompletion: (value) => setPreferences((prev) => ({ ...prev, showPlayerCompletion: value })),
    setAnimationsEnabled: (value) => setPreferences((prev) => ({ ...prev, animationsEnabled: value })),
  }), [preferences]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  return useContext(UiPreferencesContext);
}

/** Returns a formatter for a given timezone (uses stored preference). */
export function formatInTimezone(date: Date | string | number, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: timezone, ...options }).format(new Date(date));
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(date));
  }
}
