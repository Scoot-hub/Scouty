import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface CreditQuotas {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface CreditUsage {
  daily: number;
  weekly: number;
  monthly: number;
  earned_total: number;
}

export interface CreditsData {
  plan_type: string;
  quotas: CreditQuotas;
  usage: CreditUsage;
}

function authInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

export function useCredits() {
  return useQuery<CreditsData>({
    queryKey: ['credits-me'],
    queryFn: async () => {
      const res = await fetch('/api/credits/me', authInit());
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 60_000,
  });
}

export interface ConsumeParams {
  action_type: string;
  amount?: number;
  description?: string;
}

export interface ConsumeError {
  error: 'daily_limit' | 'weekly_limit' | 'monthly_limit';
  quota: number;
  used: number;
}

export function useConsumeCredit() {
  const qc = useQueryClient();
  return useMutation<void, ConsumeError, ConsumeParams>({
    mutationFn: async (params) => {
      const res = await fetch('/api/credits/consume', {
        method: 'POST',
        ...authInit(),
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const data = await res.json();
        throw data as ConsumeError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credits-me'] }),
  });
}

/** Returns remaining credits for each period. -1 means unlimited. */
export function useRemainingCredits() {
  const { data } = useCredits();
  if (!data) return null;
  const { quotas, usage } = data;
  return {
    daily: quotas.daily === -1 ? -1 : quotas.daily - usage.daily,
    weekly: quotas.weekly === -1 ? -1 : quotas.weekly - usage.weekly,
    monthly: quotas.monthly === -1 ? -1 : quotas.monthly - usage.monthly,
  };
}
