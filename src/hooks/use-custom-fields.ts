import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CustomField {
  id: string;
  user_id: string;
  field_name: string;
  field_type: 'text' | 'number' | 'select' | 'link' | 'boolean' | 'player' | 'match';
  field_options: string[];
  display_order: number;
  created_at: string;
}

export interface CustomFieldValue {
  id: string;
  custom_field_id: string;
  player_id: string;
  value: string | null;
  user_id: string;
}

async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  return user.id;
}

export function useCustomFields() {
  return useQuery({
    queryKey: ['custom_fields'],
    staleTime: 5 * 60 * 1000, // 5 min — custom fields rarely change
    queryFn: async (): Promise<CustomField[]> => {
      const { data, error } = await supabase
        .from('custom_fields')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return (data ?? []).map(d => ({
        ...d,
        field_options: Array.isArray(d.field_options) ? d.field_options as string[] : [],
      })) as CustomField[];
    },
  });
}

export function useCustomFieldValues(playerId: string | undefined) {
  return useQuery({
    queryKey: ['custom_field_values', playerId],
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<CustomFieldValue[]> => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from('custom_field_values')
        .select('*')
        .eq('player_id', playerId);
      if (error) throw error;
      return (data ?? []) as CustomFieldValue[];
    },
    enabled: !!playerId,
  });
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (field: { field_name: string; field_type: string; field_options?: string[]; display_order?: number }) => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('custom_fields')
        .insert({
          user_id: userId,
          field_name: field.field_name,
          field_type: field.field_type,
          field_options: field.field_options ?? [],
          display_order: field.display_order ?? 0,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_fields'] });
    },
  });
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; field_name?: string; field_type?: string; field_options?: string[]; display_order?: number }) => {
      const { error } = await supabase
        .from('custom_fields')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_fields'] });
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_fields')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_fields'] });
      queryClient.invalidateQueries({ queryKey: ['custom_field_values'] });
    },
  });
}

export function useUpsertCustomFieldValue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ customFieldId, playerId, value }: { customFieldId: string; playerId: string; value: string | null }) => {
      const userId = await getCurrentUserId();
      // Try update first, then insert
      const { data: existing } = await supabase
        .from('custom_field_values')
        .select('id')
        .eq('custom_field_id', customFieldId)
        .eq('player_id', playerId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('custom_field_values')
          .update({ value } as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('custom_field_values')
          .insert({
            custom_field_id: customFieldId,
            player_id: playerId,
            value,
            user_id: userId,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_field_values'] });
    },
  });
}

export function useBulkUpsertCustomFieldValues() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entries: { customFieldId: string; playerId: string; value: string | null }[]) => {
      const userId = await getCurrentUserId();
      for (const { customFieldId, playerId, value } of entries) {
        const { data: existing } = await supabase
          .from('custom_field_values')
          .select('id')
          .eq('custom_field_id', customFieldId)
          .eq('player_id', playerId)
          .maybeSingle();

        if (existing) {
          await supabase.from('custom_field_values').update({ value } as any).eq('id', existing.id);
        } else {
          await supabase.from('custom_field_values').insert({
            custom_field_id: customFieldId, player_id: playerId, value, user_id: userId,
          } as any);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_field_values'] });
    },
  });
}
