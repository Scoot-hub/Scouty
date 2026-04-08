export interface ScoutingNotes {
  physique: string;
  avec_ballon: string;
  sans_ballon: string;
  mental: string;
  personnelles: string;
}

const EMPTY: ScoutingNotes = { physique: '', avec_ballon: '', sans_ballon: '', mental: '', personnelles: '' };

/** Parse the player.notes field (plain text or JSON) into structured zones */
export function parseScoutingNotes(raw: string | null | undefined): ScoutingNotes {
  if (!raw) return { ...EMPTY };
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        physique: parsed.physique ?? '',
        avec_ballon: parsed.avec_ballon ?? '',
        sans_ballon: parsed.sans_ballon ?? '',
        mental: parsed.mental ?? '',
        personnelles: parsed.personnelles ?? '',
      };
    } catch {
      return { ...EMPTY, personnelles: raw };
    }
  }
  return { ...EMPTY, personnelles: raw };
}

/** Serialize structured zones back to a JSON string for storage */
export function serializeScoutingNotes(notes: ScoutingNotes): string {
  return JSON.stringify(notes);
}

// ── Full layout system ──

export const ALL_CARD_IDS = [
  'evaluation', 'details', 'external_data',
  'physique', 'avec_ballon', 'sans_ballon', 'mental', 'personnelles',
  'custom_fields',
  'reports', 'evolution', 'similar',
] as const;

export type CardId = (typeof ALL_CARD_IDS)[number];
export type CardSize = 'half' | 'full';

export interface LayoutConfig {
  order: CardId[];
  sizes: Record<CardId, CardSize>;
}

const LAYOUT_KEY = 'scouting-layout';

const DEFAULT_SIZES: Record<CardId, CardSize> = {
  evaluation: 'half',
  details: 'half',
  external_data: 'full',
  physique: 'half',
  avec_ballon: 'half',
  sans_ballon: 'half',
  mental: 'half',
  personnelles: 'half',
  reports: 'full',
  evolution: 'full',
  similar: 'full',
};

const DEFAULT_ORDER: CardId[] = [
  'evaluation', 'details',
  'physique', 'avec_ballon', 'sans_ballon', 'mental', 'personnelles',
  'external_data', 'reports', 'evolution', 'similar',
];

export function loadLayout(): LayoutConfig {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as LayoutConfig;
      // Ensure all IDs are present (handle new cards added after user saved)
      const order = [...parsed.order];
      for (const id of ALL_CARD_IDS) {
        if (!order.includes(id)) order.push(id);
      }
      // Remove unknown IDs
      const valid = order.filter(id => (ALL_CARD_IDS as readonly string[]).includes(id)) as CardId[];
      return {
        order: valid,
        sizes: { ...DEFAULT_SIZES, ...parsed.sizes },
      };
    }
  } catch { /* ignore */ }
  return { order: [...DEFAULT_ORDER], sizes: { ...DEFAULT_SIZES } };
}

export function saveLayout(layout: LayoutConfig) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}
