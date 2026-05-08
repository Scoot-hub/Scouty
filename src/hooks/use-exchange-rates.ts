import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');
const authInit = () => ({
  credentials: 'include' as const,
  headers: { 'Content-Type': 'application/json' },
});

export interface ExchangeRate {
  currency_code: string;
  symbol: string;
  name_fr: string;
  rate_vs_eur: number;
  updated_at: string;
}

/** Returns a map of { EUR: 1, USD: 1.08, ... } for use in convertMV() */
export function useExchangeRates() {
  return useQuery<ExchangeRate[]>({
    queryKey: ['exchange-rates'],
    queryFn: async () => {
      const res = await fetch(`${API}/exchange-rates`, authInit());
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 15 * 60 * 1000, // 15 min
  });
}

/** Convenience: returns a flat { code: rate } map */
export function useRatesMap() {
  const { data = [] } = useExchangeRates();
  const map: Record<string, number> = { EUR: 1 };
  for (const r of data) map[r.currency_code] = Number(r.rate_vs_eur);
  return map;
}

export function useUpdateExchangeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ currency_code, rate_vs_eur }: { currency_code: string; rate_vs_eur: number }) => {
      const res = await fetch(`${API}/admin/exchange-rates`, {
        method: 'PUT',
        ...authInit(),
        body: JSON.stringify({ currency_code, rate_vs_eur }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rates'] }),
  });
}
