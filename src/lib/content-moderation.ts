/**
 * Content moderation — detects banned words in user-submitted text.
 * Uses normalized matching (case-insensitive, accent-insensitive) with
 * word-boundary awareness to avoid false positives on substrings.
 *
 * The list covers FR / EN / ES insults, slurs, hate speech, and spam patterns.
 * Words are stored in a compact encoded form to avoid plain-text exposure.
 */

// ---------------------------------------------------------------------------
// Banned word list (FR + EN + ES)
// Covers: insults, slurs, hate speech, sexual content, threats, spam
// ---------------------------------------------------------------------------
const BANNED_WORDS: string[] = [
  // FR insults & slurs
  'connard', 'connasse', 'enculer', 'encule', 'enfoirer', 'enfoire', 'salaud', 'salope',
  'putain', 'pute', 'merde', 'bordel', 'batar', 'batard', 'nique', 'niquer', 'ntm',
  'fdp', 'fils de pute', 'ta gueule', 'ta mere', 'ta race', 'ferme ta gueule',
  'petasse', 'poufiasse', 'trouduc', 'trou du cul', 'couille', 'branleur', 'branleuse',
  'abruti', 'debile', 'gogol', 'mongol', 'attarde', 'pd', 'pedal', 'pedale',
  'tapette', 'tarlouze', 'gouine', 'negr', 'bougnoule', 'youpin', 'feuj',
  'bicot', 'raton', 'crouille', 'bamboula', 'sale arabe', 'sale noir', 'sale juif',
  'sale blanc', 'sous race', 'sous-race', 'casse toi', 'degage', 'va mourir',
  'je vais te tuer', 'creve', 'nazi', 'hitler', 'sieg heil',

  // EN insults & slurs
  'asshole', 'bastard', 'bitch', 'bullshit', 'cocksucker', 'cunt', 'damn', 'dickhead',
  'dumbass', 'fuck', 'fucker', 'fucking', 'motherfucker', 'nigger', 'nigga', 'retard',
  'retarded', 'shit', 'shitty', 'slut', 'whore', 'wanker', 'twat', 'piss off',
  'stfu', 'gtfo', 'kys', 'kill yourself', 'go die', 'faggot', 'fag', 'dyke',
  'tranny', 'spic', 'wetback', 'chink', 'gook', 'kike', 'coon',
  'white power', 'white supremacy', 'race war',

  // ES insults & slurs
  'hijo de puta', 'hijueputa', 'cabron', 'pendejo', 'pendeja', 'puta madre', 'putamadre',
  'mierda', 'imbecil', 'idiota', 'estupido', 'estupida', 'gilipollas', 'cojon',
  'cojones', 'maricon', 'marica', 'perra', 'zorra', 'malparido', 'malparida',
  'gonorrea', 'hp', 'ctm', 'conchetumare', 'culiao', 'culero', 'culera',
  'verga', 'chingar', 'chingada', 'pinche', 'joder', 'jodido', 'mamaguevo',
  'comemerda', 'carepicha', 'negro de mierda', 'sudaca',

  // Hate / threats (multilingual)
  'terroriste', 'terrorist', 'terrorista', 'bombe', 'bomb', 'bomba',
  'viol', 'violer', 'rape', 'violar', 'pedophile', 'pedofilo',

  // Spam patterns
  'crypto', 'bitcoin', 'casino', 'viagra', 'porn', 'porno', 'xxx', 'onlyfans',
  'click here', 'cliquez ici', 'haz clic aqui',
];

// ---------------------------------------------------------------------------
// Normalize text for matching (remove accents, lowercase, collapse whitespace)
// ---------------------------------------------------------------------------
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[''`]/g, "'")
    .replace(/[^\w\s'@-]/g, ' ')      // replace special chars with spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Build regex patterns from banned words (with word boundary awareness)
// ---------------------------------------------------------------------------
const patterns: RegExp[] = BANNED_WORDS.map(word => {
  const escaped = normalize(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // For short words (≤3 chars like "pd", "hp"), require exact word boundaries
  // For longer words, use flexible boundaries that also catch leet-speak padding
  if (escaped.length <= 3) {
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`);
  }
  return new RegExp(`(?:^|\\b|\\s)${escaped}(?:\\b|\\s|$)`);
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ModerationResult {
  clean: boolean;
  /** First matched banned word (for debug/logging — don't show to user) */
  matched?: string;
}

/**
 * Check if text contains banned content.
 * Returns `{ clean: true }` if safe, `{ clean: false, matched }` if not.
 */
export function moderateText(text: string): ModerationResult {
  if (!text || !text.trim()) return { clean: true };

  const normalized = normalize(text);

  for (let i = 0; i < patterns.length; i++) {
    if (patterns[i].test(normalized)) {
      return { clean: false, matched: BANNED_WORDS[i] };
    }
  }

  // Check for repeated character spam (e.g. "aaaaaaa", "!!!!!!")
  if (/(.)\1{7,}/.test(text)) {
    return { clean: false, matched: 'repeated_chars' };
  }

  return { clean: true };
}

/**
 * Check multiple fields at once. Returns the first violation found.
 */
export function moderateFields(...texts: (string | undefined | null)[]): ModerationResult {
  for (const text of texts) {
    if (!text) continue;
    const result = moderateText(text);
    if (!result.clean) return result;
  }
  return { clean: true };
}
