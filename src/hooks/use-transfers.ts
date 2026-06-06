import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

function getAuthHeaders(): Record<string, string> {
  try {
    const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch { return {}; }
}

export interface TransferClub {
  name: string;
  id: string;
  logo: string | null;
}

export interface RecentTransfer {
  playerName: string;
  tmPlayerId: string;
  playerSlug: string;       // e.g. "/peru-rodriguez/profil/spieler/711381"
  playerPhoto: string | null;
  position: string | null;
  age: number | null;
  nationality: string | null;
  from: TransferClub | null;
  to: TransferClub | null;
  fee: string | null;       // "23,00 mio. €", "-", "prêt", …
  transferId: string | null;
  matchedPlayerId: string | null; // internal players.id when it's one of yours
}

export interface RecentTransfersResponse {
  fetchedAt: string | null;
  count: number;
  matchedCount: number;
  transfers: RecentTransfer[];
  source: string;
  tmUrl: string;
}

/** Latest Transfermarkt transfers feed, with the caller's tracked players flagged. */
export function useRecentTransfers() {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'fr').slice(0, 2);
  return useQuery<RecentTransfersResponse>({
    queryKey: ['recent-transfers', lang],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/transfers/recent?lang=${encodeURIComponent(lang)}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to load transfers');
      return res.json();
    },
  });
}

// ── Persisted, dated transfer history of the user's players ──────────────────

export interface TransferHistoryItem {
  tmTransferId: string;
  date: string | null;        // 'YYYY-MM-DD'
  dateAccurate: boolean;      // false = detected via feed (date ≈ today, will be corrected)
  season: string | null;
  fromClub: string | null;
  fromClubLogo: string | null;
  toClub: string | null;
  toClubLogo: string | null;
  marketValue: string | null;
  fee: string | null;
  upcoming: boolean;
  tmPlayerId: string;
  playerId: string;
  playerName: string;
  playerPhoto: string | null;
}

export interface TransferHistoryResponse {
  transfers: TransferHistoryItem[];
  lastSyncedAt: string | null;
  total: number;
  playersWithTm: number;
}

export function usePlayerTransferHistory() {
  return useQuery<TransferHistoryResponse>({
    queryKey: ['transfer-history'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch('/api/transfers/history', {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to load transfer history');
      return res.json();
    },
  });
}

export interface SyncResult {
  playersSynced: number;
  playersTotal: number;
  transfers: number;
  capped: boolean;
}

/** Scrape & persist each tracked player's dated TM transfer history into the base. */
export function useSyncTransfers() {
  const { i18n } = useTranslation();
  const lang = (i18n.language || 'fr').slice(0, 2);
  const qc = useQueryClient();
  return useMutation<SyncResult, Error>({
    mutationFn: async () => {
      const res = await fetch(`/api/transfers/sync?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfer-history'] });
    },
  });
}
