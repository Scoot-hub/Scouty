import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { usePlayers, usePlayersPaginated, usePlayerFacets, isSamePlayer, useToggleArchive, fetchAllPlayerIds, type PlayersFilters, type PaginatedResponse } from '@/hooks/use-players';
import { useMyOrganizations } from '@/hooks/use-organization';
import { ShareWithOrgPopover, BulkShareDialog } from '@/components/ShareWithOrgPopover';
import { useIsPremium, useIsAdmin } from '@/hooks/use-admin';
import { getPlayerAge, getOpinionBgClass, getOpinionEmoji, getOpinionTranslationKey, ALL_OPINIONS, getTaskBgClass, getTaskEmoji, getTaskTranslationKey, translateFoot, PLAYER_TASKS, resolveLeagueName, translateCountry, type Opinion, type Position, type Foot, type PlayerTask, type Player } from '@/types/player';
import type { PerfStats } from '@/lib/player-stats';
import { usePositions } from '@/hooks/use-positions';
import { FlagIcon } from '@/components/ui/flag-icon';
import { useCustomFields } from '@/hooks/use-custom-fields';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ClubBadge } from '@/components/ui/club-badge';
import { resolveClubName } from '@/lib/thesportsdb';
import { ClubLink } from '@/components/ui/club-link';
import { LeagueLogo } from '@/components/ui/league-logo';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ImportPlayersDialog } from '@/components/ImportPlayersDialog';
import { ImportTmClubDialog } from '@/components/ImportTmClubDialog';
import { ImportTmMatchDialog } from '@/components/ImportTmMatchDialog';
import { AddToWatchlistDialog } from '@/components/AddToWatchlistDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { Search, RotateCcw, Users, RefreshCw, ChevronDown, ChevronUp, SlidersHorizontal, Download, X, LayoutGrid, List, Table2, Building2, Swords, Eye, Zap, Check, Sparkles, Copy, Trash2, FileText, Upload, FilePlus, ClipboardList, Trophy, TrendingUp, BarChart3 } from 'lucide-react';
import { getPlayerPerfStats, CHART_COLORS } from '@/lib/player-stats';
const LazyCompareRadar = lazy(() => import('@/components/charts/CompareRadarChart'));
import { toast } from 'sonner';
import { useOperationBanner } from '@/contexts/OperationBannerContext';

type SortOption = 'name' | 'age-asc' | 'age-desc' | 'level' | 'potential' | 'recent' | 'contract' | 'rating' | 'goals' | 'assists' | 'minutes' | 'xg' | 'pass-accuracy';

const FILTER_KEY = 'players_filters';
function loadFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}'); } catch { return {}; }
}


export default function Players() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { positions: posLabels, positionShort: posShort } = usePositions();
  const [search, setSearch] = useState<string>(() => loadFilters().search ?? '');
  const [opinions, setOpinions] = useState<Opinion[]>(() => loadFilters().opinions ?? []);
  const [positions, setPositions] = useState<Position[]>(() => loadFilters().positions ?? []);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(() => loadFilters().selectedLeagues ?? []);
  const [selectedClubs, setSelectedClubs] = useState<string[]>(() => loadFilters().selectedClubs ?? []);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => loadFilters().selectedRoles ?? []);
  const [ageMin, setAgeMin] = useState<string>(() => loadFilters().ageMin ?? '');
  const [ageMax, setAgeMax] = useState<string>(() => loadFilters().ageMax ?? '');
  const [levelMin, setLevelMin] = useState<string>(() => loadFilters().levelMin ?? '');
  const [levelMax, setLevelMax] = useState<string>(() => loadFilters().levelMax ?? '');
  const [potMin, setPotMin] = useState<string>(() => loadFilters().potMin ?? '');
  const [potMax, setPotMax] = useState<string>(() => loadFilters().potMax ?? '');
  const [selectedContractRanges, setSelectedContractRanges] = useState<string[]>(() => loadFilters().selectedContractRanges ?? []);
  const [selectedTasks, setSelectedTasks] = useState<PlayerTask[]>(() => loadFilters().selectedTasks ?? []);
  const [ratingMin, setRatingMin] = useState<string>(() => loadFilters().ratingMin ?? '');
  const [ratingMax, setRatingMax] = useState<string>(() => loadFilters().ratingMax ?? '');
  const [goalsMin, setGoalsMin] = useState<string>(() => loadFilters().goalsMin ?? '');
  const [assistsMin, setAssistsMin] = useState<string>(() => loadFilters().assistsMin ?? '');
  const [minutesMin, setMinutesMin] = useState<string>(() => loadFilters().minutesMin ?? '');
  const [xgMin, setXgMin] = useState<string>(() => loadFilters().xgMin ?? '');
  const [xaMin, setXaMin] = useState<string>(() => loadFilters().xaMin ?? '');
  const [duelsWonPctMin, setDuelsWonPctMin] = useState<string>(() => loadFilters().duelsWonPctMin ?? '');
  const [shotsOnMin, setShotsOnMin] = useState<string>(() => loadFilters().shotsOnMin ?? '');
  const [interceptionsMin, setInterceptionsMin] = useState<string>(() => loadFilters().interceptionsMin ?? '');
  const [dribblesSuccessPctMin, setDribblesSuccessPctMin] = useState<string>(() => loadFilters().dribblesSuccessPctMin ?? '');
  const [taskDropdownOpen, setTaskDropdownOpen] = useState(false);
  const [posDropdownOpen, setPosDropdownOpen] = useState(false);
  const [leagueSearch, setLeagueSearch] = useState('');
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [clubDropdownOpen, setClubDropdownOpen] = useState(false);
  const [opinionDropdownOpen, setOpinionDropdownOpen] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [contractDropdownOpen, setContractDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const [extraFiltersOpen] = useState<boolean>(() => loadFilters().extraFiltersOpen ?? false);
  const [sort, setSort] = useState<SortOption>(() => loadFilters().sort ?? 'name');
  const [tableSortKey, setTableSortKey] = useState<string>('name');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc');
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<string>('rating');
  const [compareDialogOpen, setCompareDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 });
  const [duplicateGroups, setDuplicateGroups] = useState<{ keep: Player; duplicates: Player[] }[]>([]);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [deletingDuplicates, setDeletingDuplicates] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => loadFilters().filtersOpen ?? false);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed' | 'table'>(() => loadFilters().viewMode ?? 'compact');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortDropdownOpen]);
  const [showArchived, setShowArchived] = useState(searchParams.get('view') === 'archived');

  // Debounce search to avoid filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      search, opinions, positions, selectedLeagues, selectedClubs, selectedRoles,
      ageMin, ageMax, levelMin, levelMax, potMin, potMax,
      selectedContractRanges, selectedTasks, sort, filtersOpen, extraFiltersOpen, viewMode,
      ratingMin, ratingMax, goalsMin, assistsMin, minutesMin,
      xgMin, xaMin, duelsWonPctMin, shotsOnMin, interceptionsMin, dribblesSuccessPctMin,
    }));
  }, [search, opinions, positions, selectedLeagues, selectedClubs, selectedRoles, ageMin, ageMax, levelMin, levelMax, potMin, potMax, selectedContractRanges, selectedTasks, sort, filtersOpen, extraFiltersOpen, viewMode, ratingMin, ratingMax, goalsMin, assistsMin, minutesMin, xgMin, xaMin, duelsWonPctMin, shotsOnMin, interceptionsMin, dribblesSuccessPctMin]);

  const queryClient = useQueryClient();

  // Build server-side filter params from all filter state
  const leagueParam = searchParams.get('league');
  const positionParam = searchParams.get('position');
  const opinionParam = searchParams.get('opinion');

  const paginatedFilters: PlayersFilters = useMemo(() => ({
    search: debouncedSearch || undefined,
    archived: showArchived,
    opinions: opinionParam ? [opinionParam] : opinions.length ? opinions : undefined,
    positions: positionParam ? [positionParam] : positions.length ? positions : undefined,
    leagues: leagueParam ? [leagueParam] : selectedLeagues.length ? selectedLeagues : undefined,
    clubs: selectedClubs.length ? selectedClubs : undefined,
    roles: selectedRoles.length ? selectedRoles : undefined,
    tasks: selectedTasks.length ? selectedTasks : undefined,
    levelMin: levelMin || undefined,
    levelMax: levelMax || undefined,
    potMin: potMin || undefined,
    potMax: potMax || undefined,
    ageMin: ageMin || undefined,
    ageMax: ageMax || undefined,
    contractRanges: selectedContractRanges.length ? selectedContractRanges : undefined,
    ratingMin: ratingMin || undefined,
    ratingMax: ratingMax || undefined,
    goalsMin: goalsMin || undefined,
    assistsMin: assistsMin || undefined,
    minutesMin: minutesMin || undefined,
    sort: sort || undefined,
  }), [debouncedSearch, showArchived, opinions, positions, selectedLeagues, selectedClubs, selectedRoles, selectedTasks, levelMin, levelMax, potMin, potMax, ageMin, ageMax, selectedContractRanges, ratingMin, ratingMax, goalsMin, assistsMin, minutesMin, sort, leagueParam, positionParam, opinionParam]);

  const {
    data: paginatedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = usePlayersPaginated(paginatedFilters);

  // Flatten all loaded pages into a single array
  const filtered = useMemo(
    () => paginatedData?.pages.flatMap(page => page.data) ?? [],
    [paginatedData],
  );
  const totalFiltered = paginatedData?.pages[0]?.total ?? 0;

  // Legacy: usePlayers() is still needed for features that need the full list (enrichment, duplicates, export, import)
  const { data: players = [] } = usePlayers();

  const { data: facets } = usePlayerFacets(showArchived);

  const toggleArchive = useToggleArchive();
  const { data: customFields = [] } = useCustomFields();
  const { data: isPremium } = useIsPremium();
  const { data: isAdmin } = useIsAdmin();
  const { addOperation, updateOperation, completeOperation } = useOperationBanner();
  const { data: myOrgs = [] } = useMyOrganizations();
  const hasOrg = myOrgs.length > 0;

  // IntersectionObserver for infinite scroll
  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingRef = useRef(isFetchingNextPage);
  hasNextPageRef.current = hasNextPage;
  isFetchingRef.current = isFetchingNextPage;

  const observerRef = useRef<IntersectionObserver | null>(null);

  // Callback ref: sets up / tears down the observer whenever the sentinel mounts or unmounts
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Disconnect previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!node) return;
    sentinelRef.current = node;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPageRef.current && !isFetchingRef.current) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    observerRef.current = observer;
  }, [fetchNextPage]);

  // When a fetch completes and the sentinel is still visible, trigger the next fetch.
  // Handles the case where content doesn't fill the viewport.
  useEffect(() => {
    if (!isFetchingNextPage && hasNextPage && sentinelRef.current) {
      const rect = sentinelRef.current.getBoundingClientRect();
      if (rect.top < window.innerHeight + 400) {
        fetchNextPage();
      }
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  const dismissNews = useCallback((playerId: string) => {
    // Optimistically update paginated cache
    queryClient.setQueriesData<{ pages: PaginatedResponse[]; pageParams: number[] }>({ queryKey: ['players-paginated'] }, (old) => {
      if (!old?.pages) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          data: page.data.map((p) => p.id === playerId ? { ...p, has_news: null } : p),
        })),
      };
    });
    // Also update legacy cache
    queryClient.setQueryData<Player[]>(['players'], (old) =>
      old?.map(p => p.id === playerId ? { ...p, has_news: null } : p)
    );
    supabase.from('players').update({ has_news: null }).eq('id', playerId).then();
  }, [queryClient]);

  const [exporting, setExporting] = useState(false);
  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);
  const [importClubOpen, setImportClubOpen] = useState(false);
  const [importMatchOpen, setImportMatchOpen] = useState(false);
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [bulkReportOpen, setBulkReportOpen] = useState(false);
  const [bulkReportDate, setBulkReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [bulkReportOpinion, setBulkReportOpinion] = useState<Opinion>('À suivre');
  const [bulkReportTitle, setBulkReportTitle] = useState('');
  const [bulkReportLink, setBulkReportLink] = useState('');
  const [bulkReportFile, setBulkReportFile] = useState<File | null>(null);
  const [bulkReportSubmitting, setBulkReportSubmitting] = useState(false);
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);
  const [bulkTaskValue, setBulkTaskValue] = useState<PlayerTask | ''>('');
  const [bulkTaskSubmitting, setBulkTaskSubmitting] = useState(false);

  const autoFetchedRef = useRef(!!sessionStorage.getItem('photos_fetched_session'));
  useEffect(() => {
    if (players.length === 0 || autoFetchedRef.current) return;
    autoFetchedRef.current = true;
    sessionStorage.setItem('photos_fetched_session', '1');

    // Auto-fetch photos for players without one (once per browser session)
    const withoutPhoto = players.filter(p => !p.photo_url).length;
    if (withoutPhoto > 0) {
      supabase.functions.invoke('fetch-player-photos')
        .then(({ data, error }) => { if (!error && data?.updated > 0) refetch(); })
        .catch(console.error);
    }
    // Club logos are fetched on-demand by ClubBadge (saves to DB automatically)
  }, [players]);

  const CONTRACT_RANGES = [
    { label: t('players.contract_expired'), key: 'expired' },
    { label: t('players.contract_6m'), key: '6m' },
    { label: t('players.contract_12m'), key: '12m' },
    { label: t('players.contract_2y'), key: '2y' },
    { label: t('players.contract_2y_plus'), key: '2y+' },
    { label: t('players.contract_none'), key: 'none' },
  ];

  const resolveLeague = useCallback((p: { club: string; league: string }) =>
    resolveLeagueName(p.club, p.league), []);

  // Dropdown options from server-side facets (avoids loading all players)
  const availableLeagues = useMemo(() => {
    const raw = facets?.leagues ?? [];
    const seen = new Map<string, string>();
    for (const l of raw) {
      const resolved = l; // already from DB; resolveLeagueName can refine later if needed
      if (resolved && !/^\d+$/.test(resolved) && !seen.has(resolved.toLowerCase())) seen.set(resolved.toLowerCase(), resolved);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [facets]);

  const resolveClub = useCallback((club: string) => resolveClubName(club), []);

  const NO_CLUB = t('players.no_club');
  const EXCLUDED_CLUB_RE = /^_?retired.*|without club|sans club|free agent|no club|unknown|inconnu|\d+$/i;

  const availableClubs = useMemo(() => {
    const raw = facets?.clubs ?? [];
    const seen = new Map<string, string>();
    let hasNoClub = false;
    for (const c of raw) {
      const trimmed = c?.trim();
      if (!trimmed || EXCLUDED_CLUB_RE.test(trimmed)) { hasNoClub = true; continue; }
      const canonical = resolveClub(trimmed);
      const key = canonical.toLowerCase();
      if (!seen.has(key)) seen.set(key, canonical);
    }
    const sorted = Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'fr'));
    if (hasNoClub) sorted.unshift(NO_CLUB);
    return sorted;
  }, [facets, resolveClub, NO_CLUB]);

  const availableRoles = useMemo(() => (facets?.roles ?? []).sort((a, b) => a.localeCompare(b, 'fr')), [facets]);

  const handleFindDuplicates = () => {
    const groups: { keep: Player; duplicates: Player[] }[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < players.length; i++) {
      if (processed.has(players[i].id)) continue;
      const dupes: Player[] = [];

      for (let j = i + 1; j < players.length; j++) {
        if (processed.has(players[j].id)) continue;
        if (isSamePlayer(players[i].name, players[i].generation, players[j].name, players[j].generation, players[i].club, players[j].club)) {
          dupes.push(players[j]);
          processed.add(players[j].id);
        }
      }

      if (dupes.length > 0) {
        processed.add(players[i].id);
        // Keep the one with more data (reports, level, etc.) — or just the first
        groups.push({ keep: players[i], duplicates: dupes });
      }
    }

    setDuplicateGroups(groups);
    setDuplicateDialogOpen(true);

    if (groups.length === 0) {
      toast.success(t('players.no_duplicates'));
    }
  };

  const handleDeleteDuplicates = async () => {
    setDeletingDuplicates(true);
    try {
      const idsToDelete = duplicateGroups.flatMap(g => g.duplicates.map(d => d.id));
      for (const id of idsToDelete) {
        await supabase.from('players').delete().eq('id', id);
      }
      toast.success(t('players.duplicates_deleted', { count: idsToDelete.length }));
      setDuplicateDialogOpen(false);
      setDuplicateGroups([]);
      refetch();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setDeletingDuplicates(false);
    }
  };

  const handleBulkEnrich = async (mode: 'all' | 'selected') => {
    if (mode === 'all') {
      // Server-side background enrichment — returns immediately
      const { data, error } = await supabase.functions.invoke('enrich-all-players');
      if (error) { toast.error(t('common.error')); return; }
      const enrichResult = data as { alreadyRunning?: boolean; total?: number } | null;
      if (enrichResult?.alreadyRunning) { toast(t('players.enrichment_already_running') || 'Enrichissement déjà en cours'); return; }
      const total = enrichResult?.total ?? players.length;
      const opId = `enrich-all-${Date.now()}`;
      addOperation({ id: opId, type: 'enrichment', label: t('banner.enrichment_label', { count: total }), current: 0, total });
      // Poll server for real progress instead of estimating
      const pollInterval = setInterval(async () => {
        try {
          const { data: progress } = await supabase.functions.invoke('enrich-all-progress');
          if (!progress) return;
          const current = (progress.done ?? 0) + (progress.errors ?? 0);
          updateOperation(opId, { current });
          if (!progress.running) {
            clearInterval(pollInterval);
            completeOperation(opId, { newCount: progress.done ?? 0, errorCount: progress.errors > 0 ? progress.errors : undefined });
            refetch();
          }
        } catch {
          // Ignore polling errors
        }
      }, 3000);
      return;
    }

    // Selected players — client-side with progress (skip recently enriched within 1h)
    const ENRICH_COOLDOWN = 60 * 60 * 1000;
    const allTargets = filtered.filter(p => selectedIds.has(p.id));
    const targets = isAdmin ? allTargets : allTargets.filter(p => {
      if (!p.external_data_fetched_at) return true;
      return Date.now() - new Date(p.external_data_fetched_at).getTime() > ENRICH_COOLDOWN;
    });
    const skipped = allTargets.length - targets.length;
    if (targets.length === 0) { toast(skipped > 0 ? t('players.enrichment_skipped') : t('common.error')); return; }
    setEnriching(true);
    setEnrichProgress({ current: 0, total: targets.length });
    const opId = `enrich-selected-${Date.now()}`;
    addOperation({ id: opId, type: 'enrichment', label: t('banner.enrichment_label', { count: targets.length }), current: 0, total: targets.length });
    let success = 0;
    let errors = 0;
    for (const p of targets) {
      try {
        await supabase.functions.invoke('enrich-player', {
          body: { playerName: p.name, club: p.club, playerId: p.id, nationality: p.nationality, generation: p.generation, position: p.position },
        });
        success++;
      } catch (e) { console.error('Enrich failed for', p.name, e); errors++; }
      setEnrichProgress(prev => ({ ...prev, current: prev.current + 1 }));
      updateOperation(opId, { current: success + errors });
    }
    completeOperation(opId, { newCount: success, errorCount: errors > 0 ? errors : undefined });
    setEnriching(false);
    setSelectedIds(new Set());
    refetch();
  };

  const handleBulkAddDone = () => {
    setSelectedIds(new Set());
  };

  const handleBulkAttachReport = async () => {
    const playerIds = Array.from(selectedIds);
    if (playerIds.length === 0) return;
    setBulkReportSubmitting(true);
    try {
      // Upload file once, reuse URL for all players
      let fileUrl: string | undefined;
      if (bulkReportFile) {
        const ext = bulkReportFile.name.split('.').pop() || 'bin';
        const fileName = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('reports').upload(fileName, bulkReportFile);
        if (uploadError) { console.error('Bulk report upload error:', uploadError); toast.error(t('common.error')); setBulkReportSubmitting(false); return; }
        const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName);
        fileUrl = urlData.publicUrl || undefined;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t('common.error')); setBulkReportSubmitting(false); return; }

      // Insert one by one (same as useAddReport) to respect RLS policies
      let successCount = 0;
      for (const pid of playerIds) {
        const reportData: { player_id: string; report_date: string; opinion: Opinion; user_id: string; title?: string; drive_link?: string; file_url?: string } = {
          player_id: pid,
          report_date: bulkReportDate,
          opinion: bulkReportOpinion,
          user_id: user.id,
        };
        if (bulkReportTitle) reportData.title = bulkReportTitle;
        if (bulkReportLink) reportData.drive_link = bulkReportLink;
        if (fileUrl) reportData.file_url = fileUrl;

        const { error } = await supabase.from('reports').insert(reportData);
        if (error) { console.error('Bulk report insert error for player', pid, error); }
        else successCount++;
      }

      if (successCount === 0) throw new Error('All inserts failed');
      toast.success(t('players.bulk_report_success', { count: successCount }));
      setBulkReportOpen(false);
      setBulkReportTitle('');
      setBulkReportLink('');
      setBulkReportFile(null);
      setBulkReportOpinion('À suivre');
      setBulkReportDate(new Date().toISOString().slice(0, 10));
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    } catch (err) {
      console.error('Bulk attach report error:', err);
      toast.error(t('common.error'));
    } finally {
      setBulkReportSubmitting(false);
    }
  };

  const handleBulkSetTask = async () => {
    const playerIds = Array.from(selectedIds);
    if (playerIds.length === 0) return;
    setBulkTaskSubmitting(true);
    try {
      const taskValue = bulkTaskValue || null;
      let successCount = 0;
      for (const pid of playerIds) {
        const { error } = await supabase.from('players').update({ task: taskValue }).eq('id', pid);
        if (error) console.error('Bulk task update error for player', pid, error);
        else successCount++;
      }
      if (successCount === 0) throw new Error('All updates failed');
      toast.success(t('players.bulk_task_success', { count: successCount }));
      setBulkTaskOpen(false);
      setBulkTaskValue('');
      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      console.error('Bulk set task error:', err);
      toast.error(t('common.error'));
    } finally {
      setBulkTaskSubmitting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelectAll = async () => {
    if (totalFiltered > 0 && selectedIds.size >= totalFiltered) {
      setSelectedIds(new Set());
    } else {
      try {
        const allIds = await fetchAllPlayerIds(paginatedFilters);
        setSelectedIds(new Set(allIds));
      } catch (err) {
        console.error('Failed to fetch all player IDs:', err);
      }
    }
  };

  const toggleInList = <T,>(list: T[], item: T, setter: (v: T[]) => void) => {
    setter(list.includes(item) ? list.filter(x => x !== item) : [...list, item]);
  };

  function getContractKey(contractEnd?: string): string {
    if (!contractEnd) return 'none';
    const months = Math.floor((new Date(contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
    if (months < 0) return 'expired';
    if (months <= 6) return '6m';
    if (months <= 12) return '12m';
    if (months <= 24) return '2y';
    return '2y+';
  }

  // Counts from server-side facets
  const archivedCount = facets?.archivedCount ?? 0;
  const activeCount = facets?.activeCount ?? 0;

  const newsCount = useMemo(() => filtered.filter(p => p.has_news).length, [filtered]);

  const leaderboards = useMemo(() => {
    const withStats = filtered.map(p => ({ ...p, perf: getPlayerPerfStats(p) })).filter(p => p.perf.rating != null || p.perf.goals != null);
    return {
      rating: [...withStats].sort((a, b) => (b.perf.rating ?? -1) - (a.perf.rating ?? -1)).slice(0, 10),
      goals: [...withStats].sort((a, b) => (b.perf.goals ?? -1) - (a.perf.goals ?? -1)).slice(0, 10),
      assists: [...withStats].sort((a, b) => (b.perf.assists ?? -1) - (a.perf.assists ?? -1)).slice(0, 10),
      xg: [...withStats].sort((a, b) => (b.perf.xg ?? -1) - (a.perf.xg ?? -1)).slice(0, 10),
      minutes: [...withStats].sort((a, b) => (b.perf.minutes ?? -1) - (a.perf.minutes ?? -1)).slice(0, 10),
    };
  }, [filtered]);

  const dismissAllNews = useCallback(() => {
    const idsWithNews = filtered.filter(p => p.has_news).map(p => p.id);
    if (idsWithNews.length === 0) return;
    // Optimistic update (paginated cache)
    queryClient.setQueriesData<{ pages: PaginatedResponse[]; pageParams: number[] }>({ queryKey: ['players-paginated'] }, (old) => {
      if (!old?.pages) return old;
      return { ...old, pages: old.pages.map((page) => ({ ...page, data: page.data.map((p) => idsWithNews.includes(p.id) ? { ...p, has_news: null } : p) })) };
    });
    queryClient.setQueryData<Player[]>(['players'], (old) =>
      old?.map(p => idsWithNews.includes(p.id) ? { ...p, has_news: null } : p)
    );
    supabase.from('players').update({ has_news: null }).in('id', idsWithNews).then();
  }, [filtered, queryClient]);

  const playersToExport = selectedIds.size > 0 ? filtered.filter(p => selectedIds.has(p.id)) : filtered;

  const handleExportExcel = async () => {
    if (playersToExport.length === 0) return;
    setExporting(true);
    try {
      const playerIds = playersToExport.map(p => p.id);
      const { data: allValues } = await supabase
        .from('custom_field_values')
        .select('*')
        .in('player_id', playerIds);
      const valuesMap = new Map<string, Map<string, string>>();
      (allValues ?? []).forEach((v) => {
        if (!valuesMap.has(v.player_id)) valuesMap.set(v.player_id, new Map());
        valuesMap.get(v.player_id)!.set(v.custom_field_id, v.value ?? '');
      });

      // Fetch reports for all exported players
      const { data: allReports } = await supabase
        .from('reports')
        .select('*')
        .in('player_id', playerIds)
        .order('created_at', { ascending: true });
      type ReportRow = NonNullable<typeof allReports>[number];
      const reportsMap = new Map<string, ReportRow[]>();
      (allReports ?? []).forEach((r) => {
        if (!reportsMap.has(r.player_id)) reportsMap.set(r.player_id, []);
        reportsMap.get(r.player_id)!.push(r);
      });

      // Build headers in TARGET_FIELDS order (matching import suggestions)
      const rows = playersToExport.map(p => {
        const playerReports = reportsMap.get(p.id) ?? [];
        const row: Record<string, string | number | null | undefined> = {
          'Nom du joueur': p.name,
          'Génération / Année': p.generation,
          'Nationalité': translateCountry(p.nationality, i18n.language),
          'Pied': p.foot,
          'Club': p.club,
          'Championnat': resolveLeague(p),
          'Zone': p.zone ?? '',
          'Poste': posShort[p.position],
          'Type de joueur': p.role ?? '',
          'Niveau': p.current_level,
          'Potentiel': p.potential,
          'Avis général': p.general_opinion,
          'Fin de contrat': p.contract_end ?? '',
          'Notes': p.notes ?? '',
          'TS Report publié': p.ts_report_published ? 'Oui' : '',
          'Poste secondaire': p.position_secondaire ?? '',
          'Avis rapport 1': playerReports[0]?.opinion ?? '',
          'Avis rapport 2': playerReports[1]?.opinion ?? '',
          'Avis rapport 3': playerReports[2]?.opinion ?? '',
          'Avis rapport 4': playerReports[3]?.opinion ?? '',
          'Avis rapport 5': playerReports[4]?.opinion ?? '',
          'Rapport 1': playerReports[0]?.drive_link ?? playerReports[0]?.title ?? '',
          'Rapport 2': playerReports[1]?.drive_link ?? playerReports[1]?.title ?? '',
          'Rapport 3': playerReports[2]?.drive_link ?? playerReports[2]?.title ?? '',
          'Rapport 4': playerReports[3]?.drive_link ?? playerReports[3]?.title ?? '',
          'Rapport 5': playerReports[4]?.drive_link ?? playerReports[4]?.title ?? '',
        };
        customFields.forEach(cf => {
          row[cf.field_name] = valuesMap.get(p.id)?.get(cf.id) ?? '';
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Players');
      XLSX.writeFile(wb, `scouthub-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(t('players.export_excel'));
    } catch (err) {
      console.error(err);
      toast.error(t('common.error'));
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () => {
    setSearch(''); setOpinions([]); setPositions([]);
    setSelectedLeagues([]); setSelectedClubs([]); setSelectedRoles([]);
    setAgeMin(''); setAgeMax('');
    setLevelMin(''); setLevelMax('');
    setPotMin(''); setPotMax('');
    setSelectedContractRanges([]); setSelectedTasks([]); setSort('name');
    setRatingMin(''); setRatingMax('');
    setGoalsMin(''); setAssistsMin(''); setMinutesMin('');
    setXgMin(''); setXaMin(''); setDuelsWonPctMin('');
    setShotsOnMin(''); setInterceptionsMin(''); setDribblesSuccessPctMin('');
  };

  const activeFilterCount =
    [opinions, positions, selectedLeagues, selectedClubs, selectedRoles, selectedContractRanges, selectedTasks].reduce((acc, arr) => acc + arr.length, 0)
    + (ageMin || ageMax ? 1 : 0)
    + (levelMin || levelMax ? 1 : 0)
    + (potMin || potMax ? 1 : 0)
    + (ratingMin || ratingMax ? 1 : 0)
    + (goalsMin ? 1 : 0)
    + (assistsMin ? 1 : 0)
    + (minutesMin ? 1 : 0)
    + (xgMin ? 1 : 0)
    + (xaMin ? 1 : 0)
    + (duelsWonPctMin ? 1 : 0)
    + (shotsOnMin ? 1 : 0)
    + (interceptionsMin ? 1 : 0)
    + (dribblesSuccessPctMin ? 1 : 0);

  const allOpinions = ALL_OPINIONS;
  const allPositions = Object.entries(posLabels) as [Position, string][];

  if (isLoading) return (
    <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground">{t('common.loading')}</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {showArchived ? t('players.archived_title') : t('players.title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {totalFiltered > 1 ? t('players.found_plural', { count: totalFiltered }) : t('players.found', { count: totalFiltered })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant={showArchived ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl text-xs gap-1.5"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? t('players.show_active') : t('players.show_archived')}
            {(showArchived ? activeCount : archivedCount) > 0 && (
              <span className="bg-muted-foreground/20 text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                {showArchived ? activeCount : archivedCount}
              </span>
            )}
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-xl">
                <Users className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{t('players.add_player')}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/player/new">
                  <Users className="w-4 h-4 mr-2" />
                  {t('players.add_player')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportClubOpen(true)}>
                <Building2 className="w-4 h-4 mr-2" />
                {t('players.add_club')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportMatchOpen(true)}>
                <Swords className="w-4 h-4 mr-2" />
                {t('players.add_match')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl">
                <Zap className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">{t('players.bulk_action')}</span>
                <ChevronDown className="w-3.5 h-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {selectedIds.size > 0 && (
                <>
                  <DropdownMenuItem onClick={() => setWatchlistDialogOpen(true)}>
                    <Eye className="w-4 h-4 mr-2" />
                    {t('watchlist.add_to_watchlist')} ({selectedIds.size})
                  </DropdownMenuItem>
                  {hasOrg && (
                    <DropdownMenuItem onClick={() => setOrgDialogOpen(true)}>
                      <Building2 className="w-4 h-4 mr-2" />
                      {t('players.add_to_org')} ({selectedIds.size})
                    </DropdownMenuItem>
                  )}
                  {selectedIds.size >= 2 && selectedIds.size <= 4 && (
                    <DropdownMenuItem onClick={() => setCompareDialogOpen(true)}>
                      <BarChart3 className="w-4 h-4 mr-2" />
                      {t('players.compare_button')} ({selectedIds.size})
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => handleBulkEnrich('selected')}
                    disabled={enriching || !isPremium}
                    className={!isPremium ? 'opacity-50 cursor-not-allowed' : ''}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${enriching ? 'animate-spin' : ''}`} />
                    {enriching
                      ? t('players.enriching_progress', { current: enrichProgress.current, total: enrichProgress.total })
                      : t('players.enrich_selected', { count: selectedIds.size })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBulkReportOpen(true)}>
                    <FilePlus className="w-4 h-4 mr-2" />
                    {t('players.bulk_report', { count: selectedIds.size })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBulkTaskOpen(true)}>
                    <ClipboardList className="w-4 h-4 mr-2" />
                    {t('players.bulk_task', { count: selectedIds.size })}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    const archive = !showArchived;
                    for (const id of selectedIds) {
                      await toggleArchive.mutateAsync({ playerId: id, archived: archive });
                    }
                    setSelectedIds(new Set());
                    toast.success(archive ? t('players.archived_success', { count: selectedIds.size }) : t('players.unarchived_success', { count: selectedIds.size }));
                  }}>
                    <X className="w-4 h-4 mr-2" />
                    {showArchived
                      ? t('players.unarchive_selected', { count: selectedIds.size })
                      : t('players.archive_selected', { count: selectedIds.size })}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {selectedIds.size === 0 && (
                <DropdownMenuItem
                  onClick={() => handleBulkEnrich('all')}
                  disabled={enriching || !isPremium}
                  className={!isPremium ? 'opacity-50 cursor-not-allowed' : ''}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${enriching ? 'animate-spin' : ''}`} />
                  {enriching
                    ? t('players.enriching_progress', { current: enrichProgress.current, total: enrichProgress.total })
                    : t('players.enrich_all')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleFindDuplicates}>
                <Copy className="w-4 h-4 mr-2" />
                {t('players.find_duplicates')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AddToWatchlistDialog
            playerIds={Array.from(selectedIds)}
            onDone={() => setSelectedIds(new Set())}
            open={watchlistDialogOpen}
            onOpenChange={setWatchlistDialogOpen}
          />
          {hasOrg && (
            <BulkShareDialog
              playerIds={Array.from(selectedIds)}
              open={orgDialogOpen}
              onOpenChange={setOrgDialogOpen}
              onDone={handleBulkAddDone}
            />
          )}
          {/* Duplicate detection dialog */}
          <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Copy className="w-5 h-5 text-primary" />
                  {t('players.duplicates_title')}
                </DialogTitle>
                <DialogDescription>
                  {duplicateGroups.length === 0
                    ? t('players.no_duplicates')
                    : t('players.duplicates_found', { count: duplicateGroups.reduce((a, g) => a + g.duplicates.length, 0), groups: duplicateGroups.length })}
                </DialogDescription>
              </DialogHeader>

              {duplicateGroups.length > 0 && (
                <div className="space-y-4 py-2">
                  {duplicateGroups.map((group, gi) => (
                    <div key={gi} className="rounded-xl border border-border p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-bold">{group.keep.name}</span>
                        <span className="text-xs text-muted-foreground">{group.keep.club} &middot; {group.keep.generation}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 font-medium">{t('players.keep')}</span>
                      </div>
                      {group.duplicates.map(dup => (
                        <div key={dup.id} className="flex items-center gap-2 pl-6 text-muted-foreground">
                          <Trash2 className="w-3.5 h-3.5 text-destructive/60" />
                          <span className="text-sm">{dup.name}</span>
                          <span className="text-xs">{dup.club} &middot; {dup.generation}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">{t('players.duplicate')}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>{t('common.cancel')}</Button>
                {duplicateGroups.length > 0 && (
                  <Button variant="destructive" onClick={handleDeleteDuplicates} disabled={deletingDuplicates}>
                    {deletingDuplicates ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                    {t('players.delete_duplicates', { count: duplicateGroups.reduce((a, g) => a + g.duplicates.length, 0) })}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Bulk report dialog */}
          <Dialog open={bulkReportOpen} onOpenChange={setBulkReportOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('players.bulk_report_title', { count: selectedIds.size })}</DialogTitle>
                <DialogDescription>{t('players.bulk_report_desc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('profile.report_title')}</label>
                  <Input value={bulkReportTitle} onChange={e => setBulkReportTitle(e.target.value)} placeholder={t('profile.report_title_placeholder')} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('player_form.report_date')}</label>
                  <Input type="date" value={bulkReportDate} onChange={e => setBulkReportDate(e.target.value)} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('player_form.report_opinion')}</label>
                  <div className="flex gap-2">
                    {ALL_OPINIONS.map(o => (
                      <Button key={o} type="button" size="sm" variant={bulkReportOpinion === o ? 'default' : 'outline'} className="rounded-xl" onClick={() => setBulkReportOpinion(o)}>{t(getOpinionTranslationKey(o))}</Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('profile.report_link')}</label>
                  <Input value={bulkReportLink} onChange={e => setBulkReportLink(e.target.value)} placeholder={t('profile.report_link_placeholder')} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('profile.report_file')}</label>
                  {bulkReportFile ? (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border">
                      <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      <span className="text-sm truncate flex-1">{bulkReportFile.name}</span>
                      <button type="button" onClick={() => setBulkReportFile(null)} className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed cursor-pointer hover:bg-muted/30 transition-colors">
                      <Upload className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t('profile.report_file_placeholder')}</span>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.doc" className="hidden" onChange={e => { if (e.target.files?.[0]) setBulkReportFile(e.target.files[0]); }} />
                    </label>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setBulkReportOpen(false)}>{t('common.cancel')}</Button>
                <Button className="rounded-xl" onClick={handleBulkAttachReport} disabled={bulkReportSubmitting}>
                  {bulkReportSubmitting ? t('profile.saving_report') : t('players.bulk_report_submit', { count: selectedIds.size })}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Bulk task dialog */}
          <Dialog open={bulkTaskOpen} onOpenChange={setBulkTaskOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('players.bulk_task_title', { count: selectedIds.size })}</DialogTitle>
                <DialogDescription>{t('players.bulk_task_desc')}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('players.task')}</label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant={bulkTaskValue === '' ? 'default' : 'outline'} className="rounded-xl" onClick={() => setBulkTaskValue('')}>
                      {t('player_form.task_none')}
                    </Button>
                    {PLAYER_TASKS.map(tk => (
                      <Button key={tk} type="button" size="sm" variant={bulkTaskValue === tk ? 'default' : 'outline'} className="rounded-xl" onClick={() => setBulkTaskValue(tk)}>
                        {getTaskEmoji(tk)} {t(getTaskTranslationKey(tk))}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="rounded-xl" onClick={() => setBulkTaskOpen(false)}>{t('common.cancel')}</Button>
                <Button className="rounded-xl" onClick={handleBulkSetTask} disabled={bulkTaskSubmitting}>
                  {bulkTaskSubmitting ? t('common.saving') : t('players.bulk_task_submit', { count: selectedIds.size })}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="sm" className="rounded-xl" onClick={handleExportExcel} disabled={exporting || playersToExport.length === 0}>
            <Download className="w-4 h-4 sm:mr-1.5" />
            <span className="hidden sm:inline">
              {exporting ? t('players.exporting') : selectedIds.size > 0 ? `${t('players.export_excel')} (${selectedIds.size})` : t('players.export_excel')}
            </span>
          </Button>
          <ImportTmClubDialog externalOpen={importClubOpen} onExternalOpenChange={setImportClubOpen} />
          <ImportTmMatchDialog externalOpen={importMatchOpen} onExternalOpenChange={setImportMatchOpen} />
          <ImportPlayersDialog />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Search + Sort + Filter bar */}
        <Card className="card-warm">
          <CardContent className="p-4 space-y-3">
            {/* Top row: search full-width on mobile */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
              </div>
            </div>
            {/* Controls row: sort, filters, view mode */}
            <div className="flex flex-wrap items-center gap-2">
              <div ref={sortRef} className="relative">
                <button
                  type="button"
                  onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
                  className="flex items-center justify-between w-36 sm:w-44 h-9 sm:h-10 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm border border-input bg-background hover:bg-muted transition-colors"
                >
                  <span className="truncate">
                    {{ name: t('players.sort_name'), 'age-asc': t('players.sort_age_asc'), 'age-desc': t('players.sort_age_desc'), level: t('players.sort_level'), potential: t('players.sort_potential'), contract: t('players.sort_contract'), recent: t('players.sort_recent'), rating: t('players.sort_rating'), goals: t('players.sort_goals'), assists: t('players.sort_assists'), minutes: t('players.sort_minutes'), xg: t('players.sort_xg'), 'pass-accuracy': t('players.sort_pass_accuracy') }[sort]}
                  </span>
                  <ChevronDown className={`w-4 h-4 opacity-50 shrink-0 ml-1 transition-transform ${sortDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {sortDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-44 sm:w-52 p-1 max-h-80 overflow-y-auto">
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-2 py-1">{t('players.sort_general')}</p>
                    {([
                      { value: 'name', label: t('players.sort_name') },
                      { value: 'age-asc', label: t('players.sort_age_asc') },
                      { value: 'age-desc', label: t('players.sort_age_desc') },
                      { value: 'level', label: t('players.sort_level') },
                      { value: 'potential', label: t('players.sort_potential') },
                      { value: 'contract', label: t('players.sort_contract') },
                      { value: 'recent', label: t('players.sort_recent') },
                    ] as { value: SortOption; label: string }[]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setSort(opt.value); setSortDropdownOpen(false); }}
                        className={`flex items-center w-full px-2 py-1.5 rounded-md text-xs transition-colors ${sort === opt.value ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-muted'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <div className="border-t border-border/40 my-1" />
                    <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-2 py-1">{t('players.sort_performance')}</p>
                    {([
                      { value: 'rating', label: t('players.sort_rating') },
                      { value: 'goals', label: t('players.sort_goals') },
                      { value: 'assists', label: t('players.sort_assists') },
                      { value: 'minutes', label: t('players.sort_minutes') },
                      { value: 'xg', label: t('players.sort_xg') },
                      { value: 'pass-accuracy', label: t('players.sort_pass_accuracy') },
                    ] as { value: SortOption; label: string }[]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { setSort(opt.value); setSortDropdownOpen(false); }}
                        className={`flex items-center w-full px-2 py-1.5 rounded-md text-xs transition-colors ${sort === opt.value ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-muted'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setFiltersOpen(!filtersOpen)}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-colors ${filtersOpen ? 'bg-primary text-primary-foreground border-primary' : activeFilterCount > 0 ? 'border-primary text-primary bg-primary/10' : 'border-border bg-background hover:bg-muted'}`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {t('players.filters')}
                {activeFilterCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filtersOpen ? 'bg-white/20 text-white' : 'bg-primary text-primary-foreground'}`}>{activeFilterCount}</span>
                )}
                {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {(activeFilterCount > 0 || search) && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="rounded-xl gap-1 text-muted-foreground hover:text-foreground px-2 sm:px-3">
                  <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('common.reset')}</span>
                </Button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <div className="flex items-center rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setViewMode('compact')}
                    className={`p-1.5 transition-colors ${viewMode === 'compact' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                    title={t('players.view_compact')}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('detailed')}
                    className={`p-1.5 transition-colors ${viewMode === 'detailed' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                    title={t('players.view_detailed')}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 transition-colors ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                    title={t('players.view_table')}
                  >
                    <Table2 className="w-4 h-4" />
                  </button>
                </div>
                <label className="flex items-center gap-1.5 sm:gap-2.5 cursor-pointer">
                  <Checkbox checked={totalFiltered > 0 && selectedIds.size >= totalFiltered} onCheckedChange={toggleSelectAll} />
                  <span className="text-xs sm:text-sm hidden sm:inline">{t('players.select_all')}</span>
                </label>
              </div>
            </div>

            {/* Active filter chips — in hierarchy order */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {positions.map(p => (
                  <FilterChip key={p} label={posShort[p]} onRemove={() => toggleInList(positions, p, setPositions)} />
                ))}
                {(ageMin || ageMax) && (
                  <FilterChip label={`Âge : ${ageMin || '?'} – ${ageMax || '?'}`} onRemove={() => { setAgeMin(''); setAgeMax(''); }} />
                )}
                {(levelMin || levelMax) && (
                  <FilterChip label={`Niv. : ${levelMin || '?'} – ${levelMax || '?'}`} onRemove={() => { setLevelMin(''); setLevelMax(''); }} />
                )}
                {(potMin || potMax) && (
                  <FilterChip label={`Pot. : ${potMin || '?'} – ${potMax || '?'}`} onRemove={() => { setPotMin(''); setPotMax(''); }} />
                )}
                {selectedLeagues.map(l => (
                  <FilterChip key={l} label={l} onRemove={() => toggleInList(selectedLeagues, l, setSelectedLeagues)} />
                ))}
                {selectedClubs.map(c => (
                  <FilterChip key={c} label={c} onRemove={() => toggleInList(selectedClubs, c, setSelectedClubs)} />
                ))}
                {opinions.map(o => (
                  <FilterChip key={o} label={`${getOpinionEmoji(o)} ${o}`} onRemove={() => toggleInList(opinions, o, setOpinions)} />
                ))}
                {selectedRoles.map(r => (
                  <FilterChip key={r} label={r} onRemove={() => toggleInList(selectedRoles, r, setSelectedRoles)} />
                ))}
                {selectedContractRanges.map(c => (
                  <FilterChip key={c} label={CONTRACT_RANGES.find(r => r.key === c)?.label ?? c} onRemove={() => toggleInList(selectedContractRanges, c, setSelectedContractRanges)} />
                ))}
                {selectedTasks.map(tk => (
                  <FilterChip key={tk} label={`${getTaskEmoji(tk)} ${t(getTaskTranslationKey(tk))}`} onRemove={() => toggleInList(selectedTasks, tk, setSelectedTasks)} />
                ))}
                {(ratingMin || ratingMax) && (
                  <FilterChip label={`Rating : ${ratingMin || '?'} – ${ratingMax || '?'}`} onRemove={() => { setRatingMin(''); setRatingMax(''); }} />
                )}
                {goalsMin && (
                  <FilterChip label={`${t('players.filter_goals')} ≥ ${goalsMin}`} onRemove={() => setGoalsMin('')} />
                )}
                {assistsMin && (
                  <FilterChip label={`${t('players.filter_assists')} ≥ ${assistsMin}`} onRemove={() => setAssistsMin('')} />
                )}
                {minutesMin && (
                  <FilterChip label={`${t('players.filter_minutes')} ≥ ${minutesMin}`} onRemove={() => setMinutesMin('')} />
                )}
                {xgMin && <FilterChip label={`xG ≥ ${xgMin}`} onRemove={() => setXgMin('')} />}
                {xaMin && <FilterChip label={`xA ≥ ${xaMin}`} onRemove={() => setXaMin('')} />}
                {duelsWonPctMin && <FilterChip label={`${t('players.filter_duels_pct')} ≥ ${duelsWonPctMin}%`} onRemove={() => setDuelsWonPctMin('')} />}
                {shotsOnMin && <FilterChip label={`${t('players.filter_shots_on')} ≥ ${shotsOnMin}`} onRemove={() => setShotsOnMin('')} />}
                {interceptionsMin && <FilterChip label={`${t('players.filter_interceptions')} ≥ ${interceptionsMin}`} onRemove={() => setInterceptionsMin('')} />}
                {dribblesSuccessPctMin && <FilterChip label={`${t('players.filter_dribbles_pct')} ≥ ${dribblesSuccessPctMin}%`} onRemove={() => setDribblesSuccessPctMin('')} />}
              </div>
            )}

            {/* Collapsible filter panel */}
            {filtersOpen && (
              <div className="pt-4 border-t border-border/40 space-y-5">

                {/* Primary filters — ligne 1 : Poste, Âge, Niveau, Potentiel */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

                  {/* 1. Poste — dropdown */}
                  <FilterSection title={t('players.position')}>
                    <div className="relative">
                      <button
                        onClick={() => setPosDropdownOpen(!posDropdownOpen)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${positions.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                      >
                        <span>{positions.length === 0 ? t('players.all_positions') : positions.length === 1 ? `${posShort[positions[0]]} — ${posLabels[positions[0]]}` : t('players.positions_selected', { count: positions.length })}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1 transition-transform ${posDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {posDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg p-2 space-y-2">
                          {([
                            { zone: t('players.zone_goalkeeper'), keys: ['GK'] as Position[] },
                            { zone: t('players.zone_defence'), keys: ['DC', 'LD', 'LG'] as Position[] },
                            { zone: t('players.zone_midfield'), keys: ['MDef', 'MC', 'MO'] as Position[] },
                            { zone: t('players.zone_attack'), keys: ['AD', 'AG', 'ATT'] as Position[] },
                          ] as { zone: string; keys: Position[] }[]).map(({ zone, keys }) => (
                            <div key={zone}>
                              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1 px-1">{zone}</p>
                              <div className="space-y-0.5">
                                {keys.map(key => (
                                  <label key={key} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-muted cursor-pointer">
                                    <Checkbox checked={positions.includes(key)} onCheckedChange={() => toggleInList(positions, key, setPositions)} />
                                    <span className="text-xs font-semibold">{posShort[key]}</span>
                                    <span className="text-xs text-muted-foreground">{posLabels[key]}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                          {positions.length > 0 && (
                            <button onClick={() => setPositions([])} className="w-full text-xs text-muted-foreground hover:text-destructive py-1 text-center border-t border-border/40 mt-1 pt-2">
                              {t('players.clear_selection')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </FilterSection>

                  {/* 2. Âge — plage sur mesure */}
                  <FilterSection title={t('players.age')}>
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="15" max="45" placeholder="Min" value={ageMin} onChange={e => setAgeMin(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                        <span className="text-muted-foreground text-xs shrink-0">–</span>
                        <input type="number" min="15" max="45" placeholder="Max" value={ageMax} onChange={e => setAgeMax(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                      </div>
                    </div>
                  </FilterSection>

                  {/* 3. Niveau — plage sur mesure */}
                  <FilterSection title={t('players.level')}>
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="1" max="10" step="0.5" placeholder="Min" value={levelMin} onChange={e => setLevelMin(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                        <span className="text-muted-foreground text-xs shrink-0">–</span>
                        <input type="number" min="1" max="10" step="0.5" placeholder="Max" value={levelMax} onChange={e => setLevelMax(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                      </div>
                    </div>
                  </FilterSection>

                  {/* 4. Potentiel — plage sur mesure */}
                  <FilterSection title={t('players.potential')}>
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="1" max="10" step="0.5" placeholder="Min" value={potMin} onChange={e => setPotMin(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                        <span className="text-muted-foreground text-xs shrink-0">–</span>
                        <input type="number" min="1" max="10" step="0.5" placeholder="Max" value={potMax} onChange={e => setPotMax(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                      </div>
                    </div>
                  </FilterSection>

                </div>

                {/* Ligne 2 : Championnat, Club, Avis, Type, Contrat — dropdowns alignés */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

                  {/* 1. Championnat */}
                  <FilterSection title={t('players.league')}>
                    <div className="relative">
                      <button
                        onClick={() => setLeagueDropdownOpen(!leagueDropdownOpen)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${selectedLeagues.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                      >
                        <span className="truncate flex items-center gap-1.5">{selectedLeagues.length === 0 ? t('players.all_leagues') : selectedLeagues.length === 1 ? <><LeagueLogo league={selectedLeagues[0]} size="xs" /> {selectedLeagues[0]}</> : t('players.leagues_selected', { count: selectedLeagues.length })}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1 transition-transform ${leagueDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {leagueDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-80">
                          <div className="p-2 border-b border-border/40">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                              <input
                                placeholder={t('players.filter_placeholder')}
                                value={leagueSearch}
                                onChange={e => setLeagueSearch(e.target.value)}
                                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                          </div>
                          <div className="max-h-64 overflow-y-auto p-1">
                            {availableLeagues
                              .filter(l => l.toLowerCase().includes(leagueSearch.toLowerCase()))
                              .map(league => (
                                <label key={league} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selectedLeagues.includes(league) ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                                  <Checkbox checked={selectedLeagues.includes(league)} onCheckedChange={() => toggleInList(selectedLeagues, league, setSelectedLeagues)} />
                                  <LeagueLogo league={league} size="sm" />
                                  <span className={`text-xs font-medium truncate ${selectedLeagues.includes(league) ? 'text-primary font-semibold' : 'text-foreground'}`}>{league}</span>
                                </label>
                              ))}
                            {availableLeagues.filter(l => l.toLowerCase().includes(leagueSearch.toLowerCase())).length === 0 && (
                              <p className="text-xs text-muted-foreground p-3 text-center">{t('players.no_results')}</p>
                            )}
                          </div>
                          {selectedLeagues.length > 0 && (
                            <button onClick={() => setSelectedLeagues([])} className="w-full text-xs text-muted-foreground hover:text-destructive py-2 text-center border-t border-border/40">
                              {t('players.clear_selection')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </FilterSection>

                  {/* 2. Club */}
                  <FilterSection title={t('players.club')}>
                    <div className="relative">
                      <button
                        onClick={() => setClubDropdownOpen(!clubDropdownOpen)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${selectedClubs.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                      >
                        <span className="truncate flex items-center gap-1.5">{selectedClubs.length === 0 ? t('players.all_clubs') : selectedClubs.length === 1 ? <><ClubBadge club={selectedClubs[0]} size="xs" /> {selectedClubs[0]}</> : t('players.clubs_selected', { count: selectedClubs.length })}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1 transition-transform ${clubDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {clubDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-80">
                          <div className="p-2 border-b border-border/40">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                              <input
                                placeholder={t('players.filter_placeholder')}
                                value={clubSearch}
                                onChange={e => setClubSearch(e.target.value)}
                                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                          </div>
                          <div className="max-h-64 overflow-y-auto p-1">
                            {availableClubs
                              .filter(c => c.toLowerCase().includes(clubSearch.toLowerCase()))
                              .map(club => (
                                <label key={club} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selectedClubs.includes(club) ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                                  <Checkbox checked={selectedClubs.includes(club)} onCheckedChange={() => toggleInList(selectedClubs, club, setSelectedClubs)} />
                                  <ClubBadge club={club} size="xs" />
                                  <span className={`text-xs font-medium truncate ${selectedClubs.includes(club) ? 'text-primary font-semibold' : 'text-foreground'}`}>{club}</span>
                                </label>
                              ))}
                            {availableClubs.filter(c => c.toLowerCase().includes(clubSearch.toLowerCase())).length === 0 && (
                              <p className="text-xs text-muted-foreground p-3 text-center">{t('players.no_results')}</p>
                            )}
                          </div>
                          {selectedClubs.length > 0 && (
                            <button onClick={() => setSelectedClubs([])} className="w-full text-xs text-muted-foreground hover:text-destructive py-2 text-center border-t border-border/40">
                              {t('players.clear_selection')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </FilterSection>

                  {/* 3. Avis */}
                  <FilterSection title={t('players.opinion')}>
                    <div className="relative">
                      <button
                        onClick={() => setOpinionDropdownOpen(!opinionDropdownOpen)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${opinions.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                      >
                        <span className="truncate">{opinions.length === 0 ? t('players.all_opinions') : opinions.length === 1 ? `${getOpinionEmoji(opinions[0])} ${opinions[0]}` : t('players.opinions_selected', { count: opinions.length })}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1 transition-transform ${opinionDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {opinionDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-56">
                          <div className="p-1">
                            {allOpinions.map(o => (
                              <label key={o} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${opinions.includes(o) ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                                <Checkbox checked={opinions.includes(o)} onCheckedChange={() => toggleInList(opinions, o, setOpinions)} />
                                <span className="text-base leading-none shrink-0">{getOpinionEmoji(o)}</span>
                                <span className={`text-xs font-medium ${opinions.includes(o) ? 'text-primary font-semibold' : 'text-foreground'}`}>{t(getOpinionTranslationKey(o))}</span>
                              </label>
                            ))}
                          </div>
                          {opinions.length > 0 && (
                            <button onClick={() => setOpinions([])} className="w-full text-xs text-muted-foreground hover:text-destructive py-2 text-center border-t border-border/40">
                              {t('players.clear_selection')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </FilterSection>

                  {/* 3. Type de joueur */}
                  <FilterSection title={t('players.player_type')}>
                    <div className="relative">
                      <button
                        onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${selectedRoles.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                      >
                        <span className="truncate">{selectedRoles.length === 0 ? t('players.all_roles') : selectedRoles.length === 1 ? selectedRoles[0] : t('players.roles_selected', { count: selectedRoles.length })}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1 transition-transform ${roleDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {roleDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-56">
                          <div className="max-h-64 overflow-y-auto p-1">
                            {availableRoles.map(role => (
                              <label key={role} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selectedRoles.includes(role) ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                                <Checkbox checked={selectedRoles.includes(role)} onCheckedChange={() => toggleInList(selectedRoles, role, setSelectedRoles)} />
                                <span className={`text-xs font-medium ${selectedRoles.includes(role) ? 'text-primary font-semibold' : 'text-foreground'}`}>{role}</span>
                              </label>
                            ))}
                            {availableRoles.length === 0 && (
                              <p className="text-xs text-muted-foreground p-3 text-center">{t('players.no_results')}</p>
                            )}
                          </div>
                          {selectedRoles.length > 0 && (
                            <button onClick={() => setSelectedRoles([])} className="w-full text-xs text-muted-foreground hover:text-destructive py-2 text-center border-t border-border/40">
                              {t('players.clear_selection')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </FilterSection>

                  {/* 4. Tâche */}
                  <FilterSection title={t('players.task')}>
                    <div className="relative">
                      <button
                        onClick={() => setTaskDropdownOpen(!taskDropdownOpen)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${selectedTasks.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                      >
                        <span className="truncate">{selectedTasks.length === 0 ? t('players.all_tasks') : selectedTasks.length === 1 ? `${getTaskEmoji(selectedTasks[0])} ${t(getTaskTranslationKey(selectedTasks[0]))}` : t('players.tasks_selected', { count: selectedTasks.length })}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1 transition-transform ${taskDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {taskDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-48">
                          <div className="p-1">
                            {PLAYER_TASKS.map(tk => (
                              <label key={tk} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selectedTasks.includes(tk) ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                                <Checkbox checked={selectedTasks.includes(tk)} onCheckedChange={() => toggleInList(selectedTasks, tk, setSelectedTasks)} />
                                <span className="text-base leading-none shrink-0">{getTaskEmoji(tk)}</span>
                                <span className={`text-xs font-medium ${selectedTasks.includes(tk) ? 'text-primary font-semibold' : 'text-foreground'}`}>{t(getTaskTranslationKey(tk))}</span>
                              </label>
                            ))}
                          </div>
                          {selectedTasks.length > 0 && (
                            <button onClick={() => setSelectedTasks([])} className="w-full text-xs text-muted-foreground hover:text-destructive py-2 text-center border-t border-border/40">
                              {t('players.clear_selection')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </FilterSection>

                </div>

                {/* Ligne 3 : Fin de contrat */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

                  {/* 5. Fin de contrat */}
                  <FilterSection title={t('players.contract_end')}>
                    <div className="relative">
                      <button
                        onClick={() => setContractDropdownOpen(!contractDropdownOpen)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${selectedContractRanges.length > 0 ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-background text-foreground hover:bg-muted'}`}
                      >
                        <span className="truncate">{selectedContractRanges.length === 0 ? t('players.all_contracts') : selectedContractRanges.length === 1 ? CONTRACT_RANGES.find(r => r.key === selectedContractRanges[0])?.label ?? selectedContractRanges[0] : t('players.contracts_selected', { count: selectedContractRanges.length })}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 ml-1 transition-transform ${contractDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {contractDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-56">
                          <div className="p-1">
                            {CONTRACT_RANGES.map(r => (
                              <label key={r.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selectedContractRanges.includes(r.key) ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                                <Checkbox checked={selectedContractRanges.includes(r.key)} onCheckedChange={() => toggleInList(selectedContractRanges, r.key, setSelectedContractRanges)} />
                                <span className={`text-xs font-medium ${selectedContractRanges.includes(r.key) ? 'text-primary font-semibold' : 'text-foreground'}`}>{r.label}</span>
                              </label>
                            ))}
                          </div>
                          {selectedContractRanges.length > 0 && (
                            <button onClick={() => setSelectedContractRanges([])} className="w-full text-xs text-muted-foreground hover:text-destructive py-2 text-center border-t border-border/40">
                              {t('players.clear_selection')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </FilterSection>

                </div>

                {/* Ligne 4 : Filtres data / performance */}
                <div className="border-t border-border/40 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-3">{t('players.filter_data_section')}</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <FilterSection title="Rating">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="0" max="10" step="0.1" placeholder="Min" value={ratingMin} onChange={e => setRatingMin(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                        <span className="text-muted-foreground text-xs shrink-0">–</span>
                        <input type="number" min="0" max="10" step="0.1" placeholder="Max" value={ratingMax} onChange={e => setRatingMax(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                      </div>
                    </FilterSection>
                    <FilterSection title={t('players.filter_goals')}>
                      <input type="number" min="0" placeholder="Min" value={goalsMin} onChange={e => setGoalsMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                    <FilterSection title={t('players.filter_assists')}>
                      <input type="number" min="0" placeholder="Min" value={assistsMin} onChange={e => setAssistsMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                    <FilterSection title={t('players.filter_minutes')}>
                      <input type="number" min="0" placeholder="Min" value={minutesMin} onChange={e => setMinutesMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-3">
                    <FilterSection title="xG">
                      <input type="number" min="0" step="0.1" placeholder="Min" value={xgMin} onChange={e => setXgMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                    <FilterSection title="xA">
                      <input type="number" min="0" step="0.1" placeholder="Min" value={xaMin} onChange={e => setXaMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                    <FilterSection title={t('players.filter_duels_pct')}>
                      <input type="number" min="0" max="100" placeholder="Min %" value={duelsWonPctMin} onChange={e => setDuelsWonPctMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                    <FilterSection title={t('players.filter_shots_on')}>
                      <input type="number" min="0" placeholder="Min" value={shotsOnMin} onChange={e => setShotsOnMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                    <FilterSection title={t('players.filter_interceptions')}>
                      <input type="number" min="0" placeholder="Min" value={interceptionsMin} onChange={e => setInterceptionsMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                    <FilterSection title={t('players.filter_dribbles_pct')}>
                      <input type="number" min="0" max="100" placeholder="Min %" value={dribblesSuccessPctMin} onChange={e => setDribblesSuccessPctMin(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary" />
                    </FilterSection>
                  </div>
                </div>

              </div>
            )}
          </CardContent>
        </Card>

        {/* Leaderboards */}
        {leaderboards.rating.length > 0 && (
          <div>
            <button onClick={() => setLeaderboardOpen(!leaderboardOpen)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-2">
              <Trophy className="w-3.5 h-3.5" />
              {t('players.leaderboard_title')}
              {leaderboardOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {leaderboardOpen && (
              <Card className="card-warm mb-4">
                <CardContent className="p-4">
                  <div className="flex gap-1.5 mb-3 overflow-x-auto">
                    {([
                      { key: 'rating', label: t('players.top_rating') },
                      { key: 'goals', label: t('players.top_scorers') },
                      { key: 'assists', label: t('players.top_assists') },
                      { key: 'xg', label: t('players.top_xg') },
                      { key: 'minutes', label: t('players.top_minutes') },
                    ] as const).map(tab => (
                      <button key={tab.key} onClick={() => setLeaderboardTab(tab.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${leaderboardTab === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1">
                    {(leaderboards[leaderboardTab as keyof typeof leaderboards] ?? []).map((p, i) => {
                      const val = leaderboardTab === 'rating' ? p.perf.rating?.toFixed(2) : leaderboardTab === 'xg' ? p.perf.xg?.toFixed(1) : p.perf[leaderboardTab];
                      return (
                        <Link key={p.id} to={`/player/${p.id}`}
                          className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors group">
                          <span className={`w-5 text-center text-xs font-bold ${i < 3 ? 'text-primary' : 'text-muted-foreground'}`}>{i + 1}</span>
                          <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
                          <span className="text-xs font-medium truncate flex-1 group-hover:text-primary transition-colors">{p.name}</span>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{p.club}</span>
                          <span className="text-xs font-bold tabular-nums ml-auto">{val ?? '—'}</span>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Results */}
        <div className="flex-1">
          {/* Table View */}
          {viewMode === 'table' ? (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="px-2 py-2 w-8"><Checkbox checked={totalFiltered > 0 && selectedIds.size >= totalFiltered} onCheckedChange={toggleSelectAll} /></th>
                    {([
                      { key: 'name', label: t('players.col_name'), align: 'left' },
                      { key: 'age', label: t('players.age'), align: 'center' },
                      { key: 'position', label: t('players.col_position'), align: 'center' },
                      { key: 'club', label: t('players.col_club'), align: 'left' },
                      { key: 'rating', label: 'Rating', align: 'center' },
                      { key: 'goals', label: t('players.stat_goals'), align: 'center' },
                      { key: 'assists', label: t('players.stat_assists'), align: 'center' },
                      { key: 'xg', label: 'xG', align: 'center' },
                      { key: 'xa', label: 'xA', align: 'center' },
                      { key: 'minutes', label: 'Min', align: 'center' },
                      { key: 'pass_accuracy', label: 'Pass%', align: 'center' },
                      { key: 'duels_won_pct', label: 'Duels%', align: 'center' },
                      { key: 'level', label: t('players.level'), align: 'center' },
                      { key: 'potential', label: t('players.potential'), align: 'center' },
                    ] as { key: string; label: string; align: string }[]).map(col => (
                      <th key={col.key}
                        className={`px-2 py-2 font-semibold cursor-pointer hover:text-foreground select-none whitespace-nowrap ${col.align === 'left' ? 'text-left' : 'text-center'}`}
                        onClick={() => { if (tableSortKey === col.key) setTableSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setTableSortKey(col.key); setTableSortDir('desc'); } }}>
                        {col.label} {tableSortKey === col.key ? (tableSortDir === 'desc' ? '↓' : '↑') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = filtered.map(p => ({ ...p, perf: getPlayerPerfStats(p) }));
                    const sorted = [...rows].sort((a, b) => {
                      const dir = tableSortDir === 'asc' ? 1 : -1;
                      if (tableSortKey === 'name') return dir * a.name.localeCompare(b.name);
                      if (tableSortKey === 'age') return dir * (getPlayerAge(a.generation, a.date_of_birth) - getPlayerAge(b.generation, b.date_of_birth));
                      if (tableSortKey === 'position') return dir * a.position.localeCompare(b.position);
                      if (tableSortKey === 'club') return dir * a.club.localeCompare(b.club);
                      if (tableSortKey === 'level') return dir * (a.current_level - b.current_level);
                      if (tableSortKey === 'potential') return dir * (a.potential - b.potential);
                      const aVal = a.perf[tableSortKey as keyof PerfStats] ?? -Infinity;
                      const bVal = b.perf[tableSortKey as keyof PerfStats] ?? -Infinity;
                      return dir * (aVal - bVal);
                    });
                    return sorted.map(p => {
                      const ratingColor = (p.perf.rating ?? 0) >= 7.5 ? 'text-emerald-600 dark:text-emerald-400' : (p.perf.rating ?? 0) >= 7.0 ? 'text-blue-600 dark:text-blue-400' : (p.perf.rating ?? 0) >= 6.5 ? 'text-amber-600 dark:text-amber-400' : '';
                      return (
                        <tr key={p.id} className="border-t border-border/30 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate(`/player/${p.id}`)}>
                          <td className="px-2 py-2" onClick={e => { e.stopPropagation(); toggleSelect(p.id); }}><Checkbox checked={selectedIds.has(p.id)} /></td>
                          <td className="px-2 py-2 font-medium">
                            <div className="flex items-center gap-2">
                              <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
                              <span className="truncate max-w-[140px]">{p.name}</span>
                            </div>
                          </td>
                          <td className="text-center px-2 py-2">{getPlayerAge(p.generation, p.date_of_birth)}</td>
                          <td className="text-center px-2 py-2">{posShort[p.position]}</td>
                          <td className="px-2 py-2"><span className="truncate block max-w-[120px]">{p.club}</span></td>
                          <td className={`text-center px-2 py-2 font-bold ${ratingColor}`}>{p.perf.rating?.toFixed(2) ?? '—'}</td>
                          <td className="text-center px-2 py-2 font-bold">{p.perf.goals ?? '—'}</td>
                          <td className="text-center px-2 py-2 font-bold">{p.perf.assists ?? '—'}</td>
                          <td className="text-center px-2 py-2">{p.perf.xg?.toFixed(1) ?? '—'}</td>
                          <td className="text-center px-2 py-2">{p.perf.xa?.toFixed(1) ?? '—'}</td>
                          <td className="text-center px-2 py-2">{p.perf.minutes ?? '—'}</td>
                          <td className="text-center px-2 py-2">{p.perf.pass_accuracy != null ? `${Math.round(p.perf.pass_accuracy)}%` : '—'}</td>
                          <td className="text-center px-2 py-2">{p.perf.duels_won_pct != null ? `${p.perf.duels_won_pct}%` : '—'}</td>
                          <td className="text-center px-2 py-2 font-bold">{p.current_level}</td>
                          <td className="text-center px-2 py-2 font-bold text-primary">{p.potential}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(player => {
              const ext = (player.external_data ?? {}) as Record<string, unknown>;
              return (
                <div key={player.id} className="relative">
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {hasOrg && (
                      <div className="relative">
                        <ShareWithOrgPopover playerId={player.id} compact />
                      </div>
                    )}
                    <Checkbox checked={selectedIds.has(player.id)} onCheckedChange={() => toggleSelect(player.id)} />
                  </div>
                  <Card className={`card-warm overflow-hidden hover:scale-[1.02] transition-all duration-200 ${player.has_news ? 'ring-2 ring-amber-400 dark:ring-amber-500' : ''}`}>
                    <Link to={`/player/${player.id}`} className="block group" onClick={() => player.has_news && dismissNews(player.id)}>
                      <div className="p-3 sm:p-4">
                        <div className="flex items-center gap-2.5 sm:gap-3 mb-2.5 sm:mb-3">
                          <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="lg" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              <h3 className="font-bold text-sm sm:text-base truncate max-w-[140px] sm:max-w-none group-hover:text-primary transition-colors">{player.name}</h3>
                              {player.task && (
                                <span className={`shrink-0 flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wide ${getTaskBgClass(player.task as PlayerTask)}`}>
                                  {getTaskEmoji(player.task as PlayerTask)} <span className="hidden sm:inline">{t(getTaskTranslationKey(player.task as PlayerTask))}</span>
                                </span>
                              )}
                              {player.has_news && (
                                <span className="shrink-0 flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide">
                                  <Sparkles className="w-3 h-3" />
                                  <span className="hidden sm:inline">{t('players.new_badge')}: {t(`players.news_${player.has_news}`)}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <ClubBadge club={player.club} size="sm" />
                              <div className="min-w-0">
                                <span className="text-xs sm:text-sm text-muted-foreground block truncate">{player.club}</span>
                                {ext.on_loan && ext.parent_club && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">{t('profile.on_loan')}</span>
                                    <ClubBadge club={ext.parent_club} size="xs" />
                                    <span className="text-[10px] text-muted-foreground truncate">{ext.parent_club}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-1.5">
                          <FlagIcon nationality={player.nationality} size="sm" />
                          <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-muted text-[11px] sm:text-xs font-medium">{getPlayerAge(player.generation, player.date_of_birth)} {t('common.year')}</span>
                          <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-muted text-[11px] sm:text-xs font-medium">{posShort[player.position]}</span>
                          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 text-sm font-bold font-mono">
                            <span title={t('players.level')}>{player.current_level}</span>
                            <span className="text-muted-foreground font-normal">/</span>
                            <span className="text-primary" title={t('players.potential')}>{player.potential}</span>
                          </div>
                        </div>
                        {viewMode === 'detailed' && (
                          <>
                          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/30">
                            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.foot')}</p>
                              <p className="text-xs font-semibold">{translateFoot(player.foot, t)}</p>
                            </div>
                            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.height')}</p>
                              <p className="text-xs font-semibold">{ext.height || '—'}</p>
                            </div>
                            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.value')}</p>
                              <p className="text-xs font-semibold truncate">{ext.market_value || player.market_value || '—'}</p>
                            </div>
                            <div className={`rounded-lg py-2 px-1 text-center ${ext.on_loan ? 'bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800' : 'bg-muted/50'}`}>
                              <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.contract')}</p>
                              <p className={`text-xs font-semibold ${player.contract_end && (new Date(player.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 180 ? 'text-destructive' : ''}`}>
                                {player.contract_end ? new Date(player.contract_end).toLocaleDateString(undefined, { month: '2-digit', year: 'numeric' }) : '—'}
                              </p>
                              {ext.on_loan && (
                                <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">{t('profile.on_loan_short')}</p>
                              )}
                            </div>
                          </div>
                          {(() => {
                            const perf = getPlayerPerfStats(player);
                            if (perf.rating == null && perf.goals == null) return null;
                            const ratingColor = (perf.rating ?? 0) >= 7.5 ? 'text-emerald-600 dark:text-emerald-400' : (perf.rating ?? 0) >= 7.0 ? 'text-blue-600 dark:text-blue-400' : (perf.rating ?? 0) >= 6.5 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
                            return (
                              <div className="grid grid-cols-5 gap-1.5 mt-2">
                                <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                                  <p className="text-[9px] text-muted-foreground mb-0.5">Rating</p>
                                  <p className={`text-xs font-bold ${ratingColor}`}>{perf.rating != null ? perf.rating.toFixed(1) : '—'}</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                                  <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_goals')}</p>
                                  <p className="text-xs font-bold">{perf.goals ?? '—'}</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                                  <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_assists')}</p>
                                  <p className="text-xs font-bold">{perf.assists ?? '—'}</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                                  <p className="text-[9px] text-muted-foreground mb-0.5">{t('players.stat_apps')}</p>
                                  <p className="text-xs font-bold">{perf.appearances ?? '—'}</p>
                                </div>
                                <div className="rounded-lg bg-muted/50 py-1.5 px-1 text-center">
                                  <p className="text-[9px] text-muted-foreground mb-0.5">Min.</p>
                                  <p className="text-xs font-bold">{perf.minutes != null ? (perf.minutes > 999 ? `${(perf.minutes / 1000).toFixed(1)}k` : perf.minutes) : '—'}</p>
                                </div>
                              </div>
                            );
                          })()}
                          </>
                        )}
                      </div>
                    </Link>
                  </Card>
                </div>
              );
            })}
          </div>
          )}

          {filtered.length > 0 && (
            <div className="flex flex-col items-center gap-3 mt-6">
              <p className="text-xs text-muted-foreground">
                {filtered.length} / {totalFiltered} {t('players.displayed')}
              </p>
              {isFetchingNextPage && (
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
              {/* Sentinel for IntersectionObserver infinite scroll */}
              <div ref={sentinelCallbackRef} className="h-1" />
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🔍</p>
              <p className="text-lg font-semibold text-muted-foreground">{t('players.no_results')}</p>
              <Button variant="outline" onClick={resetFilters} className="mt-4 rounded-xl">{t('common.reset')}</Button>
            </div>
          )}
        </div>
      </div>

      {/* Compare Dialog */}
      <Dialog open={compareDialogOpen} onOpenChange={setCompareDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('players.compare_dialog_title')} ({selectedIds.size})</DialogTitle>
          </DialogHeader>
          {(() => {
            const comparePlayers = filtered.filter(p => selectedIds.has(p.id)).map(p => ({ ...p, perf: getPlayerPerfStats(p) }));
            if (comparePlayers.length < 2) return null;
            const statKeys = [
              { key: 'rating', label: 'Rating' }, { key: 'goals', label: t('players.stat_goals') },
              { key: 'assists', label: t('players.stat_assists') }, { key: 'xg', label: 'xG' },
              { key: 'xa', label: 'xA' }, { key: 'minutes', label: 'Min' },
              { key: 'pass_accuracy', label: 'Pass%' }, { key: 'duels_won_pct', label: 'Duels%' },
              { key: 'tackles', label: t('players.filter_interceptions') }, { key: 'interceptions', label: 'Int.' },
              { key: 'shots_on', label: t('players.filter_shots_on') }, { key: 'dribbles_success_pct', label: 'Drib%' },
            ];
            const radarAxes = ['rating', 'goals', 'assists', 'pass_accuracy', 'duels_won_pct', 'dribbles_success_pct'];
            const maxVals: Record<string, number> = {};
            radarAxes.forEach(k => { maxVals[k] = Math.max(1, ...comparePlayers.map(p => p.perf[k as keyof PerfStats] ?? 0)); });
            const radarData = radarAxes.map(k => {
              const entry: Record<string, string | number> = { axis: statKeys.find(s => s.key === k)?.label || k };
              comparePlayers.forEach((p, i) => { entry[p.name] = maxVals[k] > 0 ? Math.round((p.perf[k as keyof PerfStats] ?? 0) / maxVals[k] * 100) : 0; });
              return entry;
            });
            return (
              <div className="space-y-4">
                <Suspense fallback={<div className="flex justify-center py-8"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>}>
                  <LazyCompareRadar radarData={radarData} players={comparePlayers} />
                </Suspense>
                <div className="overflow-x-auto rounded-lg border border-border/50">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-semibold">{t('profile.data_stat')}</th>
                      {comparePlayers.map((p, i) => (
                        <th key={p.id} className="text-center px-3 py-2 font-semibold" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>{p.name.split(' ').pop()}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {statKeys.map(sk => {
                        const vals = comparePlayers.map(p => p.perf[sk.key as keyof PerfStats] ?? null);
                        const validVals = vals.filter(v => v != null) as number[];
                        const best = validVals.length > 0 ? Math.max(...validVals) : null;
                        return (
                          <tr key={sk.key} className="border-t border-border/30">
                            <td className="px-3 py-2 font-medium">{sk.label}</td>
                            {vals.map((v, i) => (
                              <td key={i} className={`text-center px-3 py-2 font-bold tabular-nums ${v != null && v === best && validVals.length > 1 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                                {v != null ? (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(1) : v) : '—'}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Bottom banner for new players */}
      {newsCount > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300 w-[calc(100%-2rem)] sm:w-auto max-w-md sm:max-w-none">
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-amber-500 text-white shadow-xl">
            <Sparkles className="w-5 h-5 shrink-0" />
            <span className="text-sm font-semibold">{t('banner.new_count', { count: newsCount })}</span>
            <Button size="sm" variant="secondary" className="rounded-xl text-xs h-7" onClick={dismissAllNews}>
              <Check className="w-3.5 h-3.5 mr-1" />
              {t('notifications.mark_all_read')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      {children}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
      {label}
      <button onClick={onRemove} className="ml-0.5 rounded-full hover:text-destructive"><X className="w-3 h-3" /></button>
    </span>
  );
}
