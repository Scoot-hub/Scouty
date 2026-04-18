import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export interface InjuryItem {
  season: string;
  type: string;
  from: string;
  to: string;
  days: string;
  gamesMissed: string;
  club: string | null;
}

export interface InjuriesResponse {
  tmId: string;
  injuries: InjuryItem[];
  tmUrl: string;
  source: string;
  fetchedAt: string;
}

export function usePlayerInjuries(tmId: string | undefined | null, enabled = true) {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'fr').slice(0, 2).toLowerCase();
  const supportedLang = ['fr', 'en', 'es'].includes(lang) ? lang : 'fr';
  return useQuery<InjuriesResponse>({
    queryKey: ['player-tm-injuries', tmId, supportedLang],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/player-tm-injuries/${tmId}?lang=${supportedLang}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!tmId && enabled,
    staleTime: 60 * 60 * 1000,
  });
}
