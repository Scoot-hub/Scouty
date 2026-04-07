import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Player, Report } from '@/types/player';

async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  return user.id;
}

// Fetch all players
export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    staleTime: 60 * 1000, // 1 min — avoid refetching on every mount
    queryFn: async (): Promise<Player[]> => {
      // Fetch all players (bypass Supabase default 1000 limit)
      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('players')
          .select('*')
          .order('name')
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allData.map(row => ({
        ...row,
        id: row.id,
        current_level: Number(row.current_level),
        potential: Number(row.potential),
        position_secondaire: (row as any).position_secondaire ?? undefined,
        has_news: (row as any).has_news || null,
        is_archived: !!(row as any).is_archived,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })) as Player[];
    },
  });
}

// Fetch single player
export function usePlayer(id: string | undefined) {
  return useQuery({
    queryKey: ['player', id],
    staleTime: 3 * 60 * 1000, // 3 min — player data rarely changes within a session
    queryFn: async (): Promise<Player | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        current_level: Number(data.current_level),
        potential: Number(data.potential),
        position_secondaire: (data as any).position_secondaire ?? undefined,
        has_news: !!(data as any).has_news,
      } as Player;
    },
    enabled: !!id,
  });
}

// Fetch reports for a player
export function useReports(playerId: string | undefined) {
  return useQuery({
    queryKey: ['reports', playerId],
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<Report[]> => {
      if (!playerId) return [];
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('player_id', playerId)
        .order('report_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Report[];
    },
    enabled: !!playerId,
  });
}

// Fetch all reports (for dashboard)
export function useAllReports() {
  return useQuery({
    queryKey: ['reports'],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<Report[]> => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('report_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Report[];
    },
  });
}

// Upsert player
export function useUpsertPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (player: Omit<Player, 'id' | 'created_at' | 'updated_at'> & { id?: string }) => {
      const userId = await getCurrentUserId();
      if (player.id) {
        const { data, error } = await supabase
          .from('players')
          .update({
            name: player.name,
            photo_url: player.photo_url,
            generation: player.generation,
            nationality: player.nationality,
            foot: player.foot,
            club: player.club,
            league: player.league,
            zone: player.zone,
            position: player.position,
            role: player.role,
            current_level: player.current_level,
            potential: player.potential,
            general_opinion: player.general_opinion,
            contract_end: player.contract_end,
            notes: player.notes,
            ts_report_published: player.ts_report_published,
            position_secondaire: (player as any).position_secondaire,
            task: (player as any).task ?? null,
          } as any)
          .eq('id', player.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('players')
          .insert({
            name: player.name,
            photo_url: player.photo_url,
            generation: player.generation,
            nationality: player.nationality,
            foot: player.foot,
            club: player.club,
            league: player.league,
            zone: player.zone,
            position: player.position,
            role: player.role,
            current_level: player.current_level,
            potential: player.potential,
            general_opinion: player.general_opinion,
            contract_end: player.contract_end,
            notes: player.notes,
            ts_report_published: player.ts_report_published,
            position_secondaire: (player as any).position_secondaire,
            task: (player as any).task ?? null,
            user_id: userId,
          } as any)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player'] });
    },
  });
}

// Share a player with a specific organization
export function useSharePlayerWithOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playerId, organizationId }: { playerId: string; organizationId: string }) => {
      const { data, error } = await supabase.rpc('share_player_with_org', {
        player_id: playerId,
        organization_id: organizationId,
      });
      if (error) {
        console.error('share_player_with_org error:', error, { playerId, organizationId });
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player'] });
      queryClient.invalidateQueries({ queryKey: ['org-players'] });
      queryClient.invalidateQueries({ queryKey: ['player-org-shares'] });
    },
  });
}

// Unshare a player from a specific organization
export function useUnsharePlayerFromOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playerId, organizationId }: { playerId: string; organizationId: string }) => {
      const { error } = await supabase.rpc('unshare_player_from_org', {
        player_id: playerId,
        organization_id: organizationId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player'] });
      queryClient.invalidateQueries({ queryKey: ['org-players'] });
      queryClient.invalidateQueries({ queryKey: ['player-org-shares'] });
    },
  });
}

// Toggle archive status
export function useToggleArchive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playerId, archived }: { playerId: string; archived: boolean }) => {
      const { error } = await supabase
        .from('players')
        .update({ is_archived: archived ? 1 : 0 } as any)
        .eq('id', playerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player'] });
    },
  });
}

// Fetch which orgs a set of players are shared with
export function usePlayerOrgShares(playerIds: string[]) {
  return useQuery({
    queryKey: ['player-org-shares', playerIds],
    queryFn: async (): Promise<{ player_id: string; organization_id: string; organization_name: string }[]> => {
      if (playerIds.length === 0) return [];
      const { data, error } = await supabase.rpc('get_player_org_shares', { player_ids: playerIds });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: playerIds.length > 0,
    staleTime: 30 * 1000,
  });
}

// Legacy compat: toggle shared_with_org (deprecated, use useSharePlayerWithOrg / useUnsharePlayerFromOrg)
export function useToggleSharedWithOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playerId, shared }: { playerId: string; shared: boolean }) => {
      const { error } = await supabase
        .from('players')
        .update({ shared_with_org: shared } as any)
        .eq('id', playerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['player'] });
      queryClient.invalidateQueries({ queryKey: ['org-players'] });
      queryClient.invalidateQueries({ queryKey: ['player-org-shares'] });
    },
  });
}

// Add report
export function useAddReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (report: Omit<Report, 'id' | 'created_at'>) => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('reports')
        .insert({
          player_id: report.player_id,
          report_date: report.report_date,
          title: report.title,
          opinion: report.opinion,
          drive_link: report.drive_link,
          file_url: report.file_url,
          user_id: userId,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

// Normalize name for comparison: lowercase, remove diacritics, extra spaces
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if two names are similar enough to be the same player
export function isSamePlayer(
  importName: string,
  importGen: number,
  dbName: string,
  dbGen: number,
  importClub?: string,
  dbClub?: string
): boolean {
  const nA = normalizeName(importName);
  const nB = normalizeName(dbName);
  if (!nA || !nB) return false;

  const sameClub = !!(importClub && dbClub && normalizeName(importClub) === normalizeName(dbClub));
  const genClose = Math.abs(importGen - dbGen) <= 1;
  const bothGenKnown = importGen !== 2000 && dbGen !== 2000;

  // Exact name match + same club → duplicate
  if (nA === nB && sameClub) return true;

  // Exact name match + close generation (both known) → duplicate
  if (nA === nB && bothGenKnown && genClose) return true;

  // Exact name match + same generation (even default 2000 = both unknown) → duplicate
  if (nA === nB && importGen === dbGen) return true;

  // Exact name match + one gen unknown + same club → duplicate
  if (nA === nB && !bothGenKnown && sameClub) return true;

  // Partial name matching only when club AND generation both confirm
  if (!sameClub || !genClose) return false;

  const partsA = nA.split(' ').filter(Boolean);
  const partsB = nB.split(' ').filter(Boolean);

  // Last name match + first initial match + same club + close gen
  const lastA = partsA[partsA.length - 1];
  const lastB = partsB[partsB.length - 1];
  if (lastA === lastB && lastA.length >= 3 && partsA[0]?.[0] === partsB[0]?.[0]) return true;

  return false;
}

// Bulk import: upsert players + reports
export function useImportPlayers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (players: {
      player: Omit<Player, 'id' | 'created_at' | 'updated_at'>;
      reports: Omit<Report, 'id' | 'created_at' | 'player_id'>[];
    }[]) => {
      let importedCount = 0;
      let updatedCount = 0;
      const enrichQueue: { id: string; name: string; club: string; nationality?: string; generation?: number; position?: string }[] = [];
      const userId = await getCurrentUserId();

      // Fetch all existing players once for smart matching (scoped to current user)
      const { data: allExisting } = await supabase
        .from('players')
        .select('id, name, generation, club');
      const existingPlayers = allExisting ?? [];

      let skippedCount = 0;
      const skippedErrors: { name: string; error: string }[] = [];
      // resultMap: index in input array → playerId (for custom field mapping)
      const resultMap: Record<number, string> = {};

      for (let idx = 0; idx < players.length; idx++) {
        const { player, reports } = players[idx];
        try {
          // Smart duplicate detection
          const match = existingPlayers.find(ep =>
            isSamePlayer(player.name, player.generation, ep.name, ep.generation, player.club, ep.club)
          );

          let playerId: string;

          if (match) {
            // Update existing player — only overwrite fields that have meaningful values
            const updateData: Record<string, any> = {};
            if (player.nationality && player.nationality !== 'Inconnu') updateData.nationality = player.nationality;
            if (player.foot) updateData.foot = player.foot;
            if (player.club) updateData.club = player.club;
            if (player.league) updateData.league = player.league;
            if (player.zone) updateData.zone = player.zone;
            if (player.position && player.position !== 'MC') updateData.position = player.position;
            if (player.role) updateData.role = player.role;
            if (player.current_level > 0) updateData.current_level = player.current_level;
            if (player.potential > 0) updateData.potential = player.potential;
            if (player.general_opinion && player.general_opinion !== 'À revoir') updateData.general_opinion = player.general_opinion;
            if (player.contract_end) updateData.contract_end = player.contract_end;
            if (player.notes) updateData.notes = player.notes;
            if (player.ts_report_published) updateData.ts_report_published = player.ts_report_published;
            if ((player as any).position_secondaire) updateData.position_secondaire = (player as any).position_secondaire;

            if (Object.keys(updateData).length > 0) {
              const { error } = await supabase
                .from('players')
                .update(updateData)
                .eq('id', match.id);
              if (error) throw error;
            }
            playerId = match.id;
            updatedCount++;
          } else {
            // Insert new player — strip undefined/null values to avoid DB type errors
            const insertData: Record<string, any> = {
              name: player.name,
              photo_url: player.photo_url,
              generation: player.generation,
              nationality: player.nationality,
              foot: player.foot,
              club: player.club,
              league: player.league,
              zone: player.zone,
              position: player.position,
              role: player.role,
              current_level: player.current_level,
              potential: player.potential,
              general_opinion: player.general_opinion,
              contract_end: player.contract_end,
              notes: player.notes,
              ts_report_published: player.ts_report_published,
              position_secondaire: (player as any).position_secondaire,
              user_id: userId,
            };
            for (const k of Object.keys(insertData)) {
              if (insertData[k] === undefined || insertData[k] === null || insertData[k] === '') delete insertData[k];
            }
            if (!insertData.name) { skippedCount++; continue; }
            insertData.user_id = userId;

            const { data: newPlayer, error } = await supabase
              .from('players')
              .insert(insertData as any)
              .select('id')
              .single();
            if (error) throw error;
            playerId = newPlayer.id;
            existingPlayers.push({ id: playerId, name: player.name, generation: player.generation, club: player.club });
            importedCount++;
          }

          resultMap[idx] = playerId;
          enrichQueue.push({ id: playerId, name: player.name, club: player.club, nationality: player.nationality, generation: player.generation, position: player.position });

          // Add reports (avoid duplicates by drive_link or title)
          for (const report of reports) {
            try {
              if (report.drive_link) {
                const { data: existingReport } = await supabase
                  .from('reports')
                  .select('id')
                  .eq('player_id', playerId)
                  .eq('drive_link', report.drive_link)
                  .maybeSingle();
                if (existingReport) continue;
              } else if (report.title) {
                const { data: existingReport } = await supabase
                  .from('reports')
                  .select('id')
                  .eq('player_id', playerId)
                  .eq('title', report.title)
                  .maybeSingle();
                if (existingReport) continue;
              }

              const reportData: Record<string, any> = {
                player_id: playerId,
                report_date: report.report_date,
                title: report.title,
                opinion: report.opinion,
                drive_link: report.drive_link,
                user_id: userId,
              };
              for (const k of Object.keys(reportData)) {
                if (reportData[k] === undefined || reportData[k] === null || reportData[k] === '') delete reportData[k];
              }
              reportData.player_id = playerId;
              reportData.user_id = userId;

              await supabase.from('reports').insert(reportData as any);
            } catch (reportErr) {
              console.warn(`[import] Skipped report for "${player.name}":`, (reportErr as Error)?.message);
            }
          }
        } catch (err) {
          const msg = (err as Error)?.message || 'Erreur inconnue';
          console.warn(`[import] Skipped player "${player.name}":`, msg);
          skippedErrors.push({ name: player.name, error: msg });
          skippedCount++;
        }
      }

      return { importedCount, updatedCount, skippedCount, skippedErrors, enrichQueue, resultMap };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}
