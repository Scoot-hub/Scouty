import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export interface MarketValueEntry {
  value: number;
  club: string | null;
  age: number | null;
  valueLabel: string | null;
  date: string | null;
  timestamp: number;
}

export interface MarketValueResponse {
  tmId: string;
  history: MarketValueEntry[];
  tmUrl: string;
  source: string;
  fetchedAt: string;
}

export function usePlayerMarketValue(tmId: string | undefined | null, enabled = true) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'fr').slice(0, 2).toLowerCase();
  const supportedLang = ['fr', 'en', 'es'].includes(lang) ? lang : 'fr';
  return useQuery<MarketValueResponse>({
    queryKey: ['player-tm-market-value', tmId, supportedLang],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/player-tm-market-value/${tmId}?lang=${supportedLang}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!tmId && enabled,
    staleTime: 60 * 60 * 1000,
  });
}
