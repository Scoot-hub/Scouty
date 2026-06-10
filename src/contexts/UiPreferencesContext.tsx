import { createContext, useContext, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';

import type { DateFormat, TimeFormat } from '@/lib/format-utils';

interface UiPreferences {
  reducedVisionMode: boolean;
  showNotifications: boolean;
  showCredits: boolean;
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
  // ── Enrichment & cache ───────────────────────────────────────────────────
  /** Minimum number of days between two enrichments of the same player. Persisted in DB. Default 180. */
  enrichmentDelayDays: number;
  /** Hours to wait before allowing a new duplicate merge run. Persisted in DB. Default 24. */
  dedupCooldownHours: number;
  /** Cache lifetime in days for API-Football fixture data. Scout/Pro/Admin only. Persisted in DB. Default 1. */
  apifootballCacheDays: number;
  /** Cache lifetime in days for TheSportsDB club/team data. Scout/Pro/Admin only. Persisted in DB. Default 1. */
  thesportsdbCacheDays: number;
  /** Seconds before the in-app notification popup auto-dismisses. 0 = never. */
  notificationPopupDuration: 0 | 10 | 60;
  // ── Chat preferences ─────────────────────────────────────────────────────
  /** Master toggle: when false, the chat UI shows a disabled notice. */
  chatEnabled: boolean;
  /** Show emoji reaction buttons in the chat. */
  chatReactions: boolean;
  /** Show the pin button and pinned messages panel. */
  chatPins: boolean;
  /** Show the message search bar. */
  chatSearch: boolean;
  /** Show the @mention autocomplete dropdown. */
  chatMentions: boolean;
  /** Show the file attachment button (upcoming feature). */
  chatFileAttachments: boolean;
  /** Make external links clickable in messages. */
  chatExternalLinks: boolean;
}

interface UiPreferencesContextType extends UiPreferences {
  setReducedVisionMode: (value: boolean) => void;
  setShowNotifications: (value: boolean) => void;
  setShowCredits: (value: boolean) => void;
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
  setEnrichmentDelayDays: (value: number) => void;
  setDedupCooldownHours: (value: number) => void;
  setApifootballCacheDays: (value: number) => void;
  setThesportsdbCacheDays: (value: number) => void;
  setNotificationPopupDuration: (value: 0 | 10 | 60) => void;
  setChatEnabled: (value: boolean) => void;
  setChatReactions: (value: boolean) => void;
  setChatPins: (value: boolean) => void;
  setChatSearch: (value: boolean) => void;
  setChatMentions: (value: boolean) => void;
  setChatFileAttachments: (value: boolean) => void;
  setChatExternalLinks: (value: boolean) => void;
}

const STORAGE_KEY = 'scouthub-ui-preferences';

function getBrowserTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

const defaultPreferences: UiPreferences = {
  reducedVisionMode: false,
  showNotifications: true,
  showCredits: true,
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
  enrichmentDelayDays: 180,
  dedupCooldownHours: 72,
  apifootballCacheDays: 7,
  thesportsdbCacheDays: 7,
  notificationPopupDuration: 10,
  chatEnabled: true,
  chatReactions: true,
  chatPins: true,
  chatSearch: true,
  chatMentions: true,
  chatFileAttachments: true,
  chatExternalLinks: true,
};

const UiPreferencesContext = createContext<UiPreferencesContextType>({
  ...defaultPreferences,
  setReducedVisionMode: () => {},
  setShowNotifications: () => {},
  setShowCredits: () => {},
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
  setEnrichmentDelayDays: () => {},
  setDedupCooldownHours: () => {},
  setApifootballCacheDays: () => {},
  setThesportsdbCacheDays: () => {},
  setNotificationPopupDuration: () => {},
  setChatEnabled: () => {},
  setChatReactions: () => {},
  setChatPins: () => {},
  setChatSearch: () => {},
  setChatMentions: () => {},
  setChatFileAttachments: () => {},
  setChatExternalLinks: () => {},
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

  // Track server-synced prefs to detect changes
  const prevAnimRef = useRef<boolean | null>(null);
  const prevEnrichDelayRef = useRef<number | null>(null);
  const prevDedupCooldownRef = useRef<number | null>(null);
  const prevApifbCacheRef = useRef<number | null>(null);
  const prevTsdbCacheRef = useRef<number | null>(null);

  // On mount: fetch server-persisted prefs and merge
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
          if (typeof data.enrichmentDelayDays === 'number') merged.enrichmentDelayDays = data.enrichmentDelayDays;
          if (typeof data.dedupCooldownHours === 'number') merged.dedupCooldownHours = data.dedupCooldownHours;
          if (typeof data.apifootballCacheDays === 'number') merged.apifootballCacheDays = data.apifootballCacheDays;
          if (typeof data.thesportsdbCacheDays === 'number') merged.thesportsdbCacheDays = data.thesportsdbCacheDays;
          return merged;
        });
        prevAnimRef.current = typeof data.animationsEnabled === 'boolean' ? data.animationsEnabled : true;
        prevEnrichDelayRef.current = typeof data.enrichmentDelayDays === 'number' ? data.enrichmentDelayDays : 180;
        prevDedupCooldownRef.current = typeof data.dedupCooldownHours === 'number' ? data.dedupCooldownHours : 24;
        prevApifbCacheRef.current = typeof data.apifootballCacheDays === 'number' ? data.apifootballCacheDays : 1;
        prevTsdbCacheRef.current = typeof data.thesportsdbCacheDays === 'number' ? data.thesportsdbCacheDays : 1;
      })
      .catch(() => {/* not logged in or network error — ignore */});
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    const root = document.documentElement;
    root.classList.toggle('reduced-vision', preferences.reducedVisionMode);

    const patch: Record<string, unknown> = {};
    if (prevAnimRef.current !== null && prevAnimRef.current !== preferences.animationsEnabled) {
      prevAnimRef.current = preferences.animationsEnabled;
      patch.animationsEnabled = preferences.animationsEnabled;
    }
    if (prevEnrichDelayRef.current !== null && prevEnrichDelayRef.current !== preferences.enrichmentDelayDays) {
      prevEnrichDelayRef.current = preferences.enrichmentDelayDays;
      patch.enrichmentDelayDays = preferences.enrichmentDelayDays;
    }
    if (prevDedupCooldownRef.current !== null && prevDedupCooldownRef.current !== preferences.dedupCooldownHours) {
      prevDedupCooldownRef.current = preferences.dedupCooldownHours;
      patch.dedupCooldownHours = preferences.dedupCooldownHours;
    }
    if (prevApifbCacheRef.current !== null && prevApifbCacheRef.current !== preferences.apifootballCacheDays) {
      prevApifbCacheRef.current = preferences.apifootballCacheDays;
      patch.apifootballCacheDays = preferences.apifootballCacheDays;
    }
    if (prevTsdbCacheRef.current !== null && prevTsdbCacheRef.current !== preferences.thesportsdbCacheDays) {
      prevTsdbCacheRef.current = preferences.thesportsdbCacheDays;
      patch.thesportsdbCacheDays = preferences.thesportsdbCacheDays;
    }
    if (Object.keys(patch).length > 0) {
      fetch('/api/my-ui-prefs', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).catch(() => {});
    }
  }, [preferences]);

  const value = useMemo<UiPreferencesContextType>(() => ({
    ...preferences,
    setReducedVisionMode: (value) => setPreferences((prev) => ({ ...prev, reducedVisionMode: value })),
    setShowNotifications: (value) => setPreferences((prev) => ({ ...prev, showNotifications: value })),
    setShowCredits: (value) => setPreferences((prev) => ({ ...prev, showCredits: value })),
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
    setEnrichmentDelayDays: (value) => setPreferences((prev) => ({ ...prev, enrichmentDelayDays: value })),
    setDedupCooldownHours: (value) => setPreferences((prev) => ({ ...prev, dedupCooldownHours: value })),
    setApifootballCacheDays: (value) => setPreferences((prev) => ({ ...prev, apifootballCacheDays: value })),
    setThesportsdbCacheDays: (value) => setPreferences((prev) => ({ ...prev, thesportsdbCacheDays: value })),
    setNotificationPopupDuration: (value) => setPreferences((prev) => ({ ...prev, notificationPopupDuration: value })),
    setChatEnabled: (value) => setPreferences((prev) => ({ ...prev, chatEnabled: value })),
    setChatReactions: (value) => setPreferences((prev) => ({ ...prev, chatReactions: value })),
    setChatPins: (value) => setPreferences((prev) => ({ ...prev, chatPins: value })),
    setChatSearch: (value) => setPreferences((prev) => ({ ...prev, chatSearch: value })),
    setChatMentions: (value) => setPreferences((prev) => ({ ...prev, chatMentions: value })),
    setChatFileAttachments: (value) => setPreferences((prev) => ({ ...prev, chatFileAttachments: value })),
    setChatExternalLinks: (value) => setPreferences((prev) => ({ ...prev, chatExternalLinks: value })),
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
