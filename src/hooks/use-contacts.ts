import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Contact } from '@/types/contact';

async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  return user.id;
}

export function useContacts() {
  return useQuery({
    queryKey: ['contacts'],
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('last_name');
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });
}

export function useUpsertContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
      const userId = await getCurrentUserId();
      if (contact.id) {
        const { data, error } = await supabase
          .from('contacts')
          .update({
            first_name: contact.first_name,
            last_name: contact.last_name,
            photo_url: contact.photo_url,
            organization: contact.organization,
            role_title: contact.role_title,
            phone: contact.phone,
            email: contact.email,
            linkedin_url: contact.linkedin_url,
            notes: contact.notes,
          })
          .eq('id', contact.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('contacts')
          .insert({
            first_name: contact.first_name,
            last_name: contact.last_name,
            photo_url: contact.photo_url,
            organization: contact.organization,
            role_title: contact.role_title,
            phone: contact.phone,
            email: contact.email,
            linkedin_url: contact.linkedin_url,
            notes: contact.notes,
            user_id: userId,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}
