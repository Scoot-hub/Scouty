import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrgPlayers, useCurrentOrg } from '@/hooks/use-organization';
import { getPlayerAge, getOpinionBgClass, getOpinionEmoji, resolveLeagueName, type Opinion, type Position } from '@/types/player';
import { usePositions } from '@/hooks/use-positions';
import { FlagIcon } from '@/components/ui/flag-icon';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ClubBadge } from '@/components/ui/club-badge';
import { LeagueLogo } from '@/components/ui/league-logo';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddToWatchlistDialog } from '@/components/AddToWatchlistDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, RotateCcw, Users, ChevronDown, ChevronUp, SlidersHorizontal, Download, X, LayoutGrid, List, Building2, Eye, Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

type SortOption = 'name' | 'age-asc' | 'age-desc' | 'level' | 'potential' | 'recent' | 'contract';

const FILTER_KEY = 'org_players_filters';
function loadFilters() {
  try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}'); } catch { return {}; }
}

export default function OrgPlayers() {
  const { t } = useTranslation();
  const { positions: posLabels, positionShort: posShort } = usePositions();
  const { data: org, isLoading: orgLoading, isFetching: orgFetching } = useCurrentOrg();
  const { data: players = [], isLoading } = useOrgPlayers();

  const [search, setSearch] = useState<string>(() => loadFilters().search ?? '');
  const [opinions, setOpinions] = useState<Opinion[]>(() => loadFilters().opinions ?? []);
  const [positions, setPositions] = useState<Position[]>(() => loadFilters().positions ?? []);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>(() => loadFilters().selectedLeagues ?? []);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => loadFilters().selectedRoles ?? []);
  const [ageMin, setAgeMin] = useState<string>(() => loadFilters().ageMin ?? '');
  const [ageMax, setAgeMax] = useState<string>(() => loadFilters().ageMax ?? '');
  const [levelMin, setLevelMin] = useState<string>(() => loadFilters().levelMin ?? '');
  const [levelMax, setLevelMax] = useState<string>(() => loadFilters().levelMax ?? '');
  const [potMin, setPotMin] = useState<string>(() => loadFilters().potMin ?? '');
  const [potMax, setPotMax] = useState<string>(() => loadFilters().potMax ?? '');
  const [selectedContractRanges, setSelectedContractRanges] = useState<string[]>(() => loadFilters().selectedContractRanges ?? []);
  const [posDropdownOpen, setPosDropdownOpen] = useState(false);
  const [leagueSearch, setLeagueSearch] = useState('');
  const [extraFiltersOpen, setExtraFiltersOpen] = useState<boolean>(() => loadFilters().extraFiltersOpen ?? false);
  const [sort, setSort] = useState<SortOption>(() => loadFilters().sort ?? 'name');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState<boolean>(() => loadFilters().filtersOpen ?? false);
  const [viewMode, setViewMode] = useState<'compact' | 'detailed'>(() => loadFilters().viewMode ?? 'compact');
  const [exporting, setExporting] = useState(false);
  const [watchlistDialogOpen, setWatchlistDialogOpen] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({
      search, opinions, positions, selectedLeagues, selectedRoles,
      ageMin, ageMax, levelMin, levelMax, potMin, potMax,
      selectedContractRanges, sort, filtersOpen, extraFiltersOpen, viewMode,
    }));
  }, [search, opinions, positions, selectedLeagues, selectedRoles, ageMin, ageMax, levelMin, levelMax, potMin, potMax, selectedContractRanges, sort, filtersOpen, extraFiltersOpen, viewMode]);

  const CONTRACT_RANGES = [
    { label: t('players.contract_expired'), key: 'expired' },
    { label: t('players.contract_6m'), key: '6m' },
    { label: t('players.contract_12m'), key: '12m' },
    { label: t('players.contract_2y'), key: '2y' },
    { label: t('players.contract_2y_plus'), key: '2y+' },
    { label: t('players.contract_none'), key: 'none' },
  ];

  const resolveLeague = (p: { club: string; league: string }) => resolveLeagueName(p.club, p.league);

  const availableLeagues = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of players) {
      const l = resolveLeague(p);
      if (l && !/^\d+$/.test(l) && !seen.has(l.toLowerCase())) seen.set(l.toLowerCase(), l);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [players]);

  const availableRoles = useMemo(() => {
    const roles = new Set(players.filter(p => p.role).map(p => p.role!));
    return Array.from(roles).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [players]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
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

  const filtered = useMemo(() => {
    let result = [...players];
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(s) || p.club.toLowerCase().includes(s) || resolveLeague(p).toLowerCase().includes(s) || (p.owner_name && p.owner_name.toLowerCase().includes(s)));
    }
    if (opinions.length) result = result.filter(p => opinions.includes(p.general_opinion));
    if (positions.length) result = result.filter(p => positions.includes(p.position));
    if (selectedLeagues.length) result = result.filter(p => selectedLeagues.includes(resolveLeague(p)));
    if (selectedRoles.length) result = result.filter(p => p.role && selectedRoles.includes(p.role));
    const ageMinN = ageMin !== '' ? parseInt(ageMin) : null;
    const ageMaxN = ageMax !== '' ? parseInt(ageMax) : null;
    if (ageMinN !== null || ageMaxN !== null) {
      result = result.filter(p => {
        const age = getPlayerAge(p.generation, p.date_of_birth);
        if (ageMinN !== null && age < ageMinN) return false;
        if (ageMaxN !== null && age > ageMaxN) return false;
        return true;
      });
    }
    const levelMinN = levelMin !== '' ? parseFloat(levelMin) : null;
    const levelMaxN = levelMax !== '' ? parseFloat(levelMax) : null;
    if (levelMinN !== null || levelMaxN !== null) {
      result = result.filter(p => {
        if (levelMinN !== null && p.current_level < levelMinN) return false;
        if (levelMaxN !== null && p.current_level > levelMaxN) return false;
        return true;
      });
    }
    const potMinN = potMin !== '' ? parseFloat(potMin) : null;
    const potMaxN = potMax !== '' ? parseFloat(potMax) : null;
    if (potMinN !== null || potMaxN !== null) {
      result = result.filter(p => {
        if (potMinN !== null && p.potential < potMinN) return false;
        if (potMaxN !== null && p.potential > potMaxN) return false;
        return true;
      });
    }
    if (selectedContractRanges.length) result = result.filter(p => selectedContractRanges.includes(getContractKey(p.contract_end)));
    switch (sort) {
      case 'name': result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'age-asc': result.sort((a, b) => b.generation - a.generation); break;
      case 'age-desc': result.sort((a, b) => a.generation - b.generation); break;
      case 'level': result.sort((a, b) => b.current_level - a.current_level); break;
      case 'potential': result.sort((a, b) => b.potential - a.potential); break;
      case 'recent': result.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()); break;
      case 'contract': result.sort((a, b) => { const aDate = a.contract_end ? new Date(a.contract_end).getTime() : Infinity; const bDate = b.contract_end ? new Date(b.contract_end).getTime() : Infinity; return aDate - bDate; }); break;
    }
    return result;
  }, [players, search, opinions, positions, selectedLeagues, selectedRoles, ageMin, ageMax, levelMin, levelMax, potMin, potMax, selectedContractRanges, sort]);

  const playersToExport = selectedIds.size > 0 ? filtered.filter(p => selectedIds.has(p.id)) : filtered;

  const handleExportExcel = async () => {
    if (playersToExport.length === 0) return;
    setExporting(true);
    try {
      const rows = playersToExport.map(p => ({
        [t('form.name')]: p.name,
        [t('form.nationality')]: p.nationality,
        [t('players.age')]: getPlayerAge(p.generation, p.date_of_birth),
        [t('players.position')]: posShort[p.position],
        [t('form.club')]: p.club,
        [t('players.league')]: resolveLeague(p),
        [t('players.level')]: p.current_level,
        [t('players.potential')]: p.potential,
        [t('players.opinion')]: p.general_opinion,
        [t('players.contract_end')]: p.contract_end ?? '',
        [t('org.added_by_col')]: p.owner_name ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Players');
      XLSX.writeFile(wb, `scouthub-org-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
    setSelectedLeagues([]); setSelectedRoles([]);
    setAgeMin(''); setAgeMax('');
    setLevelMin(''); setLevelMax('');
    setPotMin(''); setPotMax('');
    setSelectedContractRanges([]); setSort('name');
  };

  const activeFilterCount =
    [opinions, positions, selectedLeagues, selectedRoles, selectedContractRanges].reduce((acc, arr) => acc + arr.length, 0)
    + (ageMin || ageMax ? 1 : 0)
    + (levelMin || levelMax ? 1 : 0)
    + (potMin || potMax ? 1 : 0);

  const allOpinions: Opinion[] = ['À suivre', 'À revoir', 'Défavorable'];
  const allPositions = Object.entries(posLabels) as [Position, string][];

  if (orgLoading || isLoading || (orgFetching && !org)) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-center py-20">
        <Building2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
        <p className="text-lg font-semibold text-muted-foreground">{t('org.no_org_subtitle')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('org.org_players_title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('org.org_players_subtitle', { name: org.name })} — {filtered.length > 1 ? t('players.found_plural', { count: filtered.length }) : t('players.found', { count: filtered.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl">
                  <Zap className="w-4 h-4 mr-1.5" />
                  {t('players.bulk_action')}
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setWatchlistDialogOpen(true)}>
                  <Eye className="w-4 h-4 mr-2" />
                  {t('watchlist.add_to_watchlist')} ({selectedIds.size})
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <AddToWatchlistDialog
            playerIds={Array.from(selectedIds)}
            onDone={() => setSelectedIds(new Set())}
            open={watchlistDialogOpen}
            onOpenChange={setWatchlistDialogOpen}
          />
          <Button variant="outline" size="sm" className="rounded-xl" onClick={handleExportExcel} disabled={exporting || playersToExport.length === 0}>
            <Download className="w-4 h-4 mr-1.5" />
            {exporting ? t('players.exporting') : selectedIds.size > 0 ? `${t('players.export_excel')} (${selectedIds.size})` : t('players.export_excel')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* Search + Sort + Filter bar */}
        <Card className="card-warm">
          <CardContent className="p-4 space-y-3">
            {/* Top row: always visible */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl" />
              </div>
              <Select value={sort} onValueChange={v => setSort(v as SortOption)}>
                <SelectTrigger className="rounded-xl w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{t('players.sort_name')}</SelectItem>
                  <SelectItem value="age-asc">{t('players.sort_age_asc')}</SelectItem>
                  <SelectItem value="age-desc">{t('players.sort_age_desc')}</SelectItem>
                  <SelectItem value="level">{t('players.sort_level')}</SelectItem>
                  <SelectItem value="potential">{t('players.sort_potential')}</SelectItem>
                  <SelectItem value="contract">{t('players.sort_contract')}</SelectItem>
                  <SelectItem value="recent">{t('players.sort_recent')}</SelectItem>
                </SelectContent>
              </Select>
              <button
                onClick={() => setFiltersOpen(!filtersOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${filtersOpen ? 'bg-primary text-primary-foreground border-primary' : activeFilterCount > 0 ? 'border-primary text-primary bg-primary/10' : 'border-border bg-background hover:bg-muted'}`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {t('players.filters')}
                {activeFilterCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filtersOpen ? 'bg-white/20 text-white' : 'bg-primary text-primary-foreground'}`}>{activeFilterCount}</span>
                )}
                {filtersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {(activeFilterCount > 0 || search) && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="rounded-xl gap-1.5 text-muted-foreground hover:text-foreground">
                  <RotateCcw className="w-3.5 h-3.5" /> {t('common.reset')}
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
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={toggleSelectAll} />
                  <span className="text-sm">{t('players.select_all')}</span>
                </label>
              </div>
            </div>

            {/* Active filter chips */}
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
                {opinions.map(o => (
                  <FilterChip key={o} label={`${getOpinionEmoji(o)} ${o}`} onRemove={() => toggleInList(opinions, o, setOpinions)} />
                ))}
                {selectedRoles.map(r => (
                  <FilterChip key={r} label={r} onRemove={() => toggleInList(selectedRoles, r, setSelectedRoles)} />
                ))}
                {selectedContractRanges.map(c => (
                  <FilterChip key={c} label={CONTRACT_RANGES.find(r => r.key === c)?.label ?? c} onRemove={() => toggleInList(selectedContractRanges, c, setSelectedContractRanges)} />
                ))}
              </div>
            )}

            {/* Collapsible filter panel */}
            {filtersOpen && (
              <div className="pt-4 border-t border-border/40 space-y-5">

                {/* Primary filters — Poste, Âge, Niveau, Potentiel */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

                  {/* 1. Poste */}
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

                  {/* 2. Âge */}
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

                  {/* 3. Niveau */}
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

                  {/* 4. Potentiel */}
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

                {/* Championnat */}
                <FilterSection title={t('players.league')}>
                  <div className="space-y-2">
                    <div className="relative w-64">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                      <input
                        placeholder={t('players.filter_placeholder')}
                        value={leagueSearch}
                        onChange={e => setLeagueSearch(e.target.value)}
                        className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-2 gap-y-0.5 max-h-40 overflow-y-auto pr-1">
                      {availableLeagues
                        .filter(l => l.toLowerCase().includes(leagueSearch.toLowerCase()))
                        .map(league => (
                          <label key={league} className={`flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer transition-colors ${selectedLeagues.includes(league) ? 'bg-primary/10' : 'hover:bg-muted'}`}>
                            <Checkbox checked={selectedLeagues.includes(league)} onCheckedChange={() => toggleInList(selectedLeagues, league, setSelectedLeagues)} />
                            <LeagueLogo league={league} size="sm" />
                            <span className={`text-xs font-medium truncate ${selectedLeagues.includes(league) ? 'text-primary font-semibold' : 'text-foreground'}`}>{league}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                </FilterSection>

                {/* Secondary filters toggle */}
                <div>
                  <button
                    onClick={() => setExtraFiltersOpen(!extraFiltersOpen)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {extraFiltersOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {t('players.extra_filters')}
                    {(opinions.length + selectedRoles.length + selectedContractRanges.length) > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
                        {opinions.length + selectedRoles.length + selectedContractRanges.length}
                      </span>
                    )}
                  </button>

                  {extraFiltersOpen && (
                    <div className="mt-3 pt-3 border-t border-border/30 flex flex-wrap gap-6">

                      <FilterSection title={t('players.opinion')}>
                        <div className="flex flex-col gap-1.5">
                          {allOpinions.map(o => {
                            const active = opinions.includes(o);
                            return (
                              <button key={o} onClick={() => toggleInList(opinions, o, setOpinions)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${active ? `${getOpinionBgClass(o)} border-transparent shadow-sm` : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'}`}>
                                <span>{getOpinionEmoji(o)}</span>
                                {o}
                              </button>
                            );
                          })}
                        </div>
                      </FilterSection>

                      {availableRoles.length > 0 && (
                        <FilterSection title={t('players.player_type')}>
                          <div className="flex flex-wrap gap-1.5">
                            {availableRoles.map(role => (
                              <button key={role} onClick={() => toggleInList(selectedRoles, role, setSelectedRoles)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${selectedRoles.includes(role) ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                                {role}
                              </button>
                            ))}
                          </div>
                        </FilterSection>
                      )}

                      <FilterSection title={t('players.contract_end')}>
                        <div className="flex flex-wrap gap-1.5">
                          {CONTRACT_RANGES.map(r => {
                            const active = selectedContractRanges.includes(r.key);
                            const urgency = r.key === 'expired' || r.key === '6m' ? 'urgent'
                              : r.key === '12m' ? 'warning'
                              : r.key === '2y+' ? 'safe'
                              : 'neutral';
                            return (
                              <button key={r.key} onClick={() => toggleInList(selectedContractRanges, r.key, setSelectedContractRanges)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                  active
                                    ? urgency === 'urgent' ? 'bg-destructive text-destructive-foreground border-transparent shadow-sm'
                                    : urgency === 'warning' ? 'bg-warning text-warning-foreground border-transparent shadow-sm'
                                    : urgency === 'safe' ? 'bg-success text-success-foreground border-transparent shadow-sm'
                                    : 'bg-primary text-primary-foreground border-transparent shadow-sm'
                                    : urgency === 'urgent' ? 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20'
                                    : urgency === 'warning' ? 'bg-warning/10 text-warning-foreground border-warning/20 hover:bg-warning/20'
                                    : urgency === 'safe' ? 'bg-success/10 text-success border-success/20 hover:bg-success/20'
                                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                                }`}>
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                      </FilterSection>

                    </div>
                  )}
                </div>

              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Grid */}
        <div className="flex-1">
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map(player => {
              const ext = viewMode === 'detailed' ? ((player.external_data as Record<string, any>) ?? {}) : {};
              return (
                <div key={player.id} className="relative">
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(player.id)} onCheckedChange={() => toggleSelect(player.id)} />
                  </div>
                  <Card className="card-warm overflow-hidden hover:scale-[1.02] transition-all duration-200">
                    <Link to={`/player/${player.id}`} className="block group">
                      <div className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="lg" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-base truncate group-hover:text-primary transition-colors">{player.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <ClubBadge club={player.club} size="sm" />
                              <p className="text-sm text-muted-foreground truncate">{player.club}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <FlagIcon nationality={player.nationality} size="sm" />
                          <span className="px-2 py-0.5 rounded-md bg-muted text-xs font-medium">{getPlayerAge(player.generation, player.date_of_birth)} {t('common.year')}</span>
                          <span className="px-2 py-0.5 rounded-md bg-muted text-xs font-medium">{posShort[player.position]}</span>
                          <div className="ml-auto flex items-center gap-2 text-sm font-bold font-mono">
                            <span title={t('players.level')}>{player.current_level}</span>
                            <span className="text-muted-foreground font-normal">/</span>
                            <span className="text-primary" title={t('players.potential')}>{player.potential}</span>
                          </div>
                        </div>
                        {viewMode === 'detailed' && (
                          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/30">
                            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.foot')}</p>
                              <p className="text-xs font-semibold">{player.foot || '—'}</p>
                            </div>
                            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.height')}</p>
                              <p className="text-xs font-semibold">{ext.height || '—'}</p>
                            </div>
                            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.value')}</p>
                              <p className="text-xs font-semibold truncate">{ext.market_value || player.market_value || '—'}</p>
                            </div>
                            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
                              <p className="text-[10px] text-muted-foreground mb-0.5">{t('players.contract')}</p>
                              <p className={`text-xs font-semibold ${player.contract_end && (new Date(player.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24) < 180 ? 'text-destructive' : ''}`}>
                                {player.contract_end ? new Date(player.contract_end).toLocaleDateString(undefined, { month: '2-digit', year: 'numeric' }) : '—'}
                              </p>
                            </div>
                          </div>
                        )}
                        {player.owner_name && (
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {t('org.added_by', { name: player.owner_name })}
                          </p>
                        )}
                      </div>
                    </Link>
                  </Card>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-5xl mb-4">🏟️</p>
              <p className="text-lg font-semibold text-muted-foreground">{t('org.no_shared_players')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('org.no_shared_players_hint')}</p>
              {activeFilterCount > 0 && (
                <Button variant="outline" onClick={resetFilters} className="mt-4 rounded-xl">{t('common.reset')}</Button>
              )}
            </div>
          )}
        </div>
      </div>
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
