import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    const root = document.documentElement;
    root.classList.toggle('reduced-vision', preferences.reducedVisionMode);
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
