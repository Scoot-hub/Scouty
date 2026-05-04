import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface IntegrationStatus {
  service: string;
  enabled: boolean;
  has_key: boolean;
  last_tested_at: string | null;
  test_status: 'ok' | 'error' | null;
}

export interface EnrichResult {
  ok: boolean;
  summary?: string;
  email?: string;
  company?: Record<string, string>;
  found?: boolean;
  status?: number;
  error?: string;
}

function authInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

export function useIntegrations() {
  return useQuery<IntegrationStatus[]>({
    queryKey: ['user-integrations'],
    queryFn: async () => {
      const res = await fetch('/api/integrations', authInit());
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useSaveIntegration() {
  const qc = useQueryClient();
  return useMutation<void, Error, { service: string; api_key?: string; enabled: boolean }>({
    mutationFn: async ({ service, api_key, enabled }) => {
      const res = await fetch(`/api/integrations/${service}`, {
        method: 'POST', ...authInit(),
        body: JSON.stringify({ api_key, enabled }),
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-integrations'] }),
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (service) => {
      const res = await fetch(`/api/integrations/${service}`, { method: 'DELETE', ...authInit() });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-integrations'] }),
  });
}

export function useTestIntegration() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: async (service) => {
      const res = await fetch(`/api/integrations/${service}/test`, { method: 'POST', ...authInit() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-integrations'] }),
  });
}

export function useEnrichWithModules() {
  return useMutation<{ ok: boolean; results: Record<string, EnrichResult> }, Error, { playerId: string; services?: string[] }>({
    mutationFn: async ({ playerId, services }) => {
      const res = await fetch(`/api/integrations/enrich/${playerId}`, {
        method: 'POST', ...authInit(),
        body: JSON.stringify({ services }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed');
      }
      return res.json();
    },
  });
}
