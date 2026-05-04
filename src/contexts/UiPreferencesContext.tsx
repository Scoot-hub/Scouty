import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface UiPreferences {
  reducedVisionMode: boolean;
  showNotifications: boolean;
  showChatbot: boolean;
  hideRestrictedElements: boolean;
  weekStartDay: 0 | 1; // 0 = Sunday, 1 = Monday
  distanceUnit: 'km' | 'mi';
}

interface UiPreferencesContextType extends UiPreferences {
  setReducedVisionMode: (value: boolean) => void;
  setShowNotifications: (value: boolean) => void;
  setShowChatbot: (value: boolean) => void;
  setHideRestrictedElements: (value: boolean) => void;
  setWeekStartDay: (value: 0 | 1) => void;
  setDistanceUnit: (value: 'km' | 'mi') => void;
}

const STORAGE_KEY = 'scouthub-ui-preferences';

const defaultPreferences: UiPreferences = {
  reducedVisionMode: false,
  showNotifications: true,
  showChatbot: true,
  hideRestrictedElements: false,
  weekStartDay: 1,
  distanceUnit: 'km',
};

const UiPreferencesContext = createContext<UiPreferencesContextType>({
  ...defaultPreferences,
  setReducedVisionMode: () => {},
  setShowNotifications: () => {},
  setShowChatbot: () => {},
  setHideRestrictedElements: () => {},
  setWeekStartDay: () => {},
  setDistanceUnit: () => {},
});

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UiPreferences>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultPreferences;
      return { ...defaultPreferences, ...JSON.parse(raw) };
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
  }), [preferences]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  return useContext(UiPreferencesContext);
}
