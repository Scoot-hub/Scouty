/**
 * Formatting utilities for currency, date and time — respects user preferences.
 */

// ── Currency ─────────────────────────────────────────────────────────────────

export interface CurrencyDef {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: CurrencyDef[] = [
  { code: 'EUR', symbol: '€',  name: 'Euro' },
  { code: 'USD', symbol: '$',  name: 'Dollar US' },
  { code: 'GBP', symbol: '£',  name: 'Livre sterling' },
  { code: 'CHF', symbol: 'Fr', name: 'Franc suisse' },
  { code: 'MAD', symbol: 'MAD', name: 'Dirham marocain' },
  { code: 'DZD', symbol: 'DA', name: 'Dinar algérien' },
  { code: 'TND', symbol: 'DT', name: 'Dinar tunisien' },
  { code: 'CAD', symbol: 'C$', name: 'Dollar canadien' },
  { code: 'AUD', symbol: 'A$', name: 'Dollar australien' },
  { code: 'BRL', symbol: 'R$', name: 'Réal brésilien' },
  { code: 'ARS', symbol: 'AR$', name: 'Peso argentin' },
  { code: 'COP', symbol: 'CO$', name: 'Peso colombien' },
  { code: 'MXN', symbol: 'MX$', name: 'Peso mexicain' },
  { code: 'SAR', symbol: 'ر.س', name: 'Riyal saoudien' },
  { code: 'AED', symbol: 'د.إ', name: 'Dirham émirien' },
  { code: 'JPY', symbol: '¥',  name: 'Yen japonais' },
  { code: 'KRW', symbol: '₩',  name: 'Won coréen' },
  { code: 'CNY', symbol: '¥',  name: 'Yuan chinois' },
  { code: 'INR', symbol: '₹',  name: 'Roupie indienne' },
  { code: 'TRY', symbol: '₺',  name: 'Livre turque' },
];

/**
 * Parse a market value string like "€2.5M", "€500K", "£1.2bn" into EUR cents (number).
 * Returns null if the string cannot be parsed.
 */
export function parseMV(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/\s/g, '').toUpperCase();
  // Extract numeric part and suffix
  const match = s.match(/[\d.,]+/);
  if (!match) return null;
  const num = parseFloat(match[0].replace(',', '.'));
  if (isNaN(num)) return null;

  let multiplier = 1;
  if (s.includes('BN') || s.includes('MRD')) multiplier = 1_000_000_000;
  else if (s.includes('M')) multiplier = 1_000_000;
  else if (s.includes('K')) multiplier = 1_000;

  return num * multiplier; // value in the currency of the string (assumed EUR from Transfermarkt)
}

/**
 * Format a market value (in EUR) into the target currency.
 * rates: { EUR: 1, USD: 1.08, ... } (rate vs EUR)
 */
export function formatCurrency(
  eurValue: number | null,
  currency: string,
  rates: Record<string, number>,
): string {
  if (eurValue === null) return '—';
  const rate = rates[currency] ?? 1;
  const value = eurValue * rate;
  const def = CURRENCIES.find(c => c.code === currency);
  const symbol = def?.symbol ?? currency;

  // Compact notation
  if (Math.abs(value) >= 1_000_000_000) return `${symbol}${(value / 1_000_000_000).toFixed(1)}Md`;
  if (Math.abs(value) >= 1_000_000)     return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000)          return `${symbol}${Math.round(value / 1_000)}K`;
  return `${symbol}${Math.round(value)}`;
}

/**
 * Convert a raw market value string (e.g. "€2.5M") to the selected currency.
 * Returns the original string if conversion is not possible.
 */
export function convertMV(
  raw: string | null | undefined,
  currency: string,
  rates: Record<string, number>,
): string {
  if (!raw) return '—';
  if (currency === 'EUR') return raw; // no conversion needed
  const eurValue = parseMV(raw);
  if (eurValue === null) return raw;
  return formatCurrency(eurValue, currency, rates);
}

// ── Date ─────────────────────────────────────────────────────────────────────

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export function formatDate(
  raw: string | Date | null | undefined,
  format: DateFormat,
): string {
  if (!raw) return '—';
  try {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    switch (format) {
      case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
      case 'YYYY-MM-DD': return `${yyyy}-${mm}-${dd}`;
      default:           return `${dd}/${mm}/${yyyy}`;
    }
  } catch {
    return String(raw);
  }
}

/** Shorter date for compact display (e.g., contract cards): "06/2026" or "2026-06" */
export function formatDateShort(
  raw: string | Date | null | undefined,
  format: DateFormat,
): string {
  if (!raw) return '—';
  try {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    switch (format) {
      case 'MM/DD/YYYY': return `${mm}/${yyyy}`;
      case 'YYYY-MM-DD': return `${yyyy}-${mm}`;
      default:           return `${mm}/${yyyy}`;
    }
  } catch {
    return String(raw);
  }
}

// ── Time ─────────────────────────────────────────────────────────────────────

export type TimeFormat = '24h' | '12h';

/**
 * Format a date/datetime string in 24h or 12h format.
 * If timezone is provided, converts to that timezone first.
 */
export function formatTime(
  raw: string | Date | null | undefined,
  format: TimeFormat,
  timezone?: string,
): string {
  if (!raw) return '—';
  try {
    const d = raw instanceof Date ? raw : new Date(raw);
    if (isNaN(d.getTime())) return '—';
    const opts: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: format === '12h',
      ...(timezone ? { timeZone: timezone } : {}),
    };
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  } catch {
    return '—';
  }
}

/** Format a full datetime (date + time) with user preferences. */
export function formatDateTime(
  raw: string | Date | null | undefined,
  dateFormat: DateFormat,
  timeFormat: TimeFormat,
  timezone?: string,
): string {
  const datePart = formatDate(raw, dateFormat);
  const timePart = formatTime(raw, timeFormat, timezone);
  if (datePart === '—' && timePart === '—') return '—';
  if (datePart === '—') return timePart;
  if (timePart === '—') return datePart;
  return `${datePart} ${timePart}`;
}
