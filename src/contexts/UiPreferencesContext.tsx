import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface UiPreferences {
  reducedVisionMode: boolean;
  showNotifications: boolean;
  showChatbot: boolean;
}

interface UiPreferencesContextType extends UiPreferences {
  setReducedVisionMode: (value: boolean) => void;
  setShowNotifications: (value: boolean) => void;
  setShowChatbot: (value: boolean) => void;
}

const STORAGE_KEY = 'scouthub-ui-preferences';

const defaultPreferences: UiPreferences = {
  reducedVisionMode: false,
  showNotifications: true,
  showChatbot: true,
};

const UiPreferencesContext = createContext<UiPreferencesContextType>({
  ...defaultPreferences,
  setReducedVisionMode: () => {},
  setShowNotifications: () => {},
  setShowChatbot: () => {},
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
  }), [preferences]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export function useUiPreferences() {
  return useContext(UiPreferencesContext);
}
