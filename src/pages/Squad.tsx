import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSquadPlayers, useUpsertSquadPlayer, useDeleteSquadPlayer } from '@/hooks/use-squad';
import { usePlayers } from '@/hooks/use-players';
import { useCurrentOrg, useOrgPlayers } from '@/hooks/use-organization';
import { usePositions } from '@/hooks/use-positions';
import { getPlayerAge, translateFoot, translateCountry, type Foot } from '@/types/player';
import type { SquadPlayer, SquadPlayerStatus } from '@/types/squad';
import { getSquadPlayerAge, getContractMonthsRemaining, SQUAD_STATUSES } from '@/types/squad';
import type { Position } from '@/types/player';
import { FlagIcon } from '@/components/ui/flag-icon';
import { PhotoUpload } from '@/components/ui/photo-upload';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  PlusCircle, Search, Users, Building2, CalendarClock, TrendingUp,
  Pencil, Trash2, Phone, Mail, User, FileText, Loader2, AlertTriangle,
  Shield, ChevronDown, ChevronUp, Download, UserPlus, Sparkles, ArrowRightLeft,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

const POSITION_KEYS: Position[] = ['GK', 'DC', 'LD', 'LG', 'MDef', 'MC', 'MO', 'AD', 'AG', 'ATT'];

const emptyForm = {
  name: '',
  photo_url: '',
  date_of_birth: '',
  nationality: '',
  club: '',
  league: '',
  foot: '',
  market_value: '',
  position: 'MC' as string,
  position_secondaire: '',
  jersey_number: '' as string | number,
  contract_start: '',
  contract_end: '',
  monthly_salary: '' as string | number,
  status: 'active' as SquadPlayerStatus,
  agent_name: '',
  agent_phone: '',
  agent_email: '',
  notes: '',
};

type SortOption = 'name' | 'age' | 'position' | 'contract' | 'number';

export default function Squad() {
  const { t, i18n } = useTranslation();
  const { positions: posLabels, positionShort: posShort } = usePositions();
  const { data: org, isLoading: orgLoading, isFetching: orgFetching } = useCurrentOrg();
  const { data: players = [], isLoading } = useSquadPlayers();
  const { data: myPlayers = [] } = usePlayers();
  const { data: orgPlayersList = [] } = useOrgPlayers();
  const upsert = useUpsertSquadPlayer();
  const remove = useDeleteSquadPlayer();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortOption>('number');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SquadPlayer | null>(null);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState(emptyForm);
  const [detailPlayer, setDetailPlayer] = useState<SquadPlayer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelected, setPickerSelected] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);

  // Merge personal + org players for the picker, deduped by id
  const availablePlayers = useMemo(() => {
    const map = new Map<string, typeof myPlayers[0] & { _source: 'personal' | 'org' }>();
    for (const p of myPlayers) map.set(p.id, { ...p, _source: 'personal' as const });
    for (const p of orgPlayersList) {
      if (!map.has(p.id)) map.set(p.id, { ...p, _source: 'org' as const });
    }
    return Array.from(map.values());
  }, [myPlayers, orgPlayersList]);

  const pickerFiltered = useMemo(() => {
    if (!pickerSearch.trim()) return availablePlayers.slice(0, 50);
    const q = pickerSearch.toLowerCase();
    return availablePlayers
      .filter(p => p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q) || p.nationality.toLowerCase().includes(q))
      .slice(0, 50);
  }, [availablePlayers, pickerSearch]);

  // ── Filtering & Sorting ──
  const filtered = useMemo(() => {
    let list = [...players];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q) ||
        p.agent_name.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter);
    }
    if (positionFilter !== 'all') {
      list = list.filter(p => p.position === positionFilter);
    }

    list.sort((a, b) => {
      switch (sort) {
        case 'name': return a.name.localeCompare(b.name);
        case 'age': return (getSquadPlayerAge(a) ?? 99) - (getSquadPlayerAge(b) ?? 99);
        case 'position': return POSITION_KEYS.indexOf(a.position as Position) - POSITION_KEYS.indexOf(b.position as Position);
        case 'contract': {
          const ma = getContractMonthsRemaining(a.contract_end) ?? 999;
          const mb = getContractMonthsRemaining(b.contract_end) ?? 999;
          return ma - mb;
        }
        case 'number': return (a.jersey_number ?? 999) - (b.jersey_number ?? 999);
        default: return 0;
      }
    });

    return list;
  }, [players, search, statusFilter, positionFilter, sort]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total = players.length;
    const ages = players.map(getSquadPlayerAge).filter((a): a is number => a !== null);
    const avgAge = ages.length ? (ages.reduce((s, a) => s + a, 0) / ages.length) : null;

    // Contract expiring within 12 months
    const contract12m = players.filter(p => {
      const m = getContractMonthsRemaining(p.contract_end);
      return m !== null && m >= 0 && m <= 12;
    }).length;

    // Age categories
    const u23 = ages.filter(a => a < 23).length;
    const mid = ages.filter(a => a >= 24 && a <= 30).length;
    const senior = ages.filter(a => a >= 31).length;

    // Contract duration categories
    const contractLess1 = players.filter(p => {
      const m = getContractMonthsRemaining(p.contract_end);
      return m !== null && m >= 0 && m <= 12;
    }).length;
    const contract2to3 = players.filter(p => {
      const m = getContractMonthsRemaining(p.contract_end);
      return m !== null && m > 12 && m <= 36;
    }).length;
    const contractPlus3 = players.filter(p => {
      const m = getContractMonthsRemaining(p.contract_end);
      return m !== null && m > 36;
    }).length;

    const loanedIn = players.filter(p => p.status === 'loaned_in').length;
    const loanedOut = players.filter(p => p.status === 'loaned_out').length;

    // New players (created in last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const newCount = players.filter(p => new Date(p.created_at) >= thirtyDaysAgo).length;

    return { total, avgAge, contract12m, u23, mid, senior, contractLess1, contract2to3, contractPlus3, loanedIn, loanedOut, newCount };
  }, [players]);

  const isNewPlayer = (p: SquadPlayer) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return new Date(p.created_at) >= thirtyDaysAgo;
  };

  // ── Form handlers ──
  const openCreate = () => {
    setEditingId(undefined);
    setForm(emptyForm);
    setPickerSearch('');
    setPickerSelected(new Set());
    setPickerOpen(true);
  };

  const togglePickerSelect = (id: string) => {
    setPickerSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkAdd = async () => {
    if (pickerSelected.size === 0) return;
    setBulkAdding(true);
    try {
      const toAdd = availablePlayers.filter(p => pickerSelected.has(p.id));
      for (const p of toAdd) {
        const dob = (p as any).date_of_birth;
        const ext = (p as any).external_data || {};
        await upsert.mutateAsync({
          name: p.name,
          photo_url: p.photo_url ?? null,
          date_of_birth: dob ? String(dob).slice(0, 10) : null,
          nationality: p.nationality ?? '',
          club: p.club ?? '',
          league: (p as any).league ?? '',
          foot: (p as any).foot ?? '',
          market_value: ext.market_value || (p as any).market_value || null,
          position: p.position ?? 'MC',
          position_secondaire: (p as any).position_secondaire || null,
          contract_end: p.contract_end ? String(p.contract_end).slice(0, 10) : null,
          status: 'active' as SquadPlayerStatus,
          agent_name: '',
          agent_phone: '',
          agent_email: '',
        } as any);
      }
      toast.success(t('squad.bulk_added', { count: toAdd.length }));
      setPickerOpen(false);
      setPickerSelected(new Set());
    } catch {
      toast.error(t('common.error'));
    } finally {
      setBulkAdding(false);
    }
  };

  const selectFromPicker = (p: typeof availablePlayers[0]) => {
    const dob = (p as any).date_of_birth;
    const ext = (p as any).external_data || {};
    setForm({
      ...emptyForm,
      name: p.name,
      photo_url: p.photo_url ?? '',
      date_of_birth: dob ? String(dob).slice(0, 10) : '',
      nationality: p.nationality ?? '',
      club: p.club ?? '',
      league: (p as any).league ?? '',
      foot: (p as any).foot ?? '',
      market_value: ext.market_value || (p as any).market_value || '',
      position: p.position ?? 'MC',
      position_secondaire: (p as any).position_secondaire ?? '',
      contract_end: p.contract_end ? String(p.contract_end).slice(0, 10) : '',
    });
    setPickerOpen(false);
    setDialogOpen(true);
  };

  const openManualCreate = () => {
    setForm(emptyForm);
    setPickerOpen(false);
    setDialogOpen(true);
  };

  const openEdit = (p: SquadPlayer) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      photo_url: p.photo_url ?? '',
      date_of_birth: p.date_of_birth ? p.date_of_birth.slice(0, 10) : '',
      nationality: p.nationality,
      club: p.club ?? '',
      league: p.league ?? '',
      foot: p.foot ?? '',
      market_value: p.market_value ?? '',
      position: p.position,
      position_secondaire: p.position_secondaire ?? '',
      jersey_number: p.jersey_number ?? '',
      contract_start: p.contract_start ? p.contract_start.slice(0, 10) : '',
      contract_end: p.contract_end ? p.contract_end.slice(0, 10) : '',
      monthly_salary: p.monthly_salary ?? '',
      status: p.status,
      agent_name: p.agent_name,
      agent_phone: p.agent_phone,
      agent_email: p.agent_email,
      notes: p.notes ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error(t('squad.name_required'));
      return;
    }
    try {
      await upsert.mutateAsync({
        ...(editingId ? { id: editingId } : {}),
        name: form.name.trim(),
        photo_url: form.photo_url || null,
        date_of_birth: form.date_of_birth || null,
        nationality: form.nationality,
        club: form.club,
        league: form.league,
        foot: form.foot,
        market_value: form.market_value || null,
        position: form.position,
        position_secondaire: form.position_secondaire || null,
        jersey_number: form.jersey_number ? Number(form.jersey_number) : null,
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        monthly_salary: form.monthly_salary ? Number(form.monthly_salary) : null,
        status: form.status,
        agent_name: form.agent_name,
        agent_phone: form.agent_phone,
        agent_email: form.agent_email,
        notes: form.notes || null,
      } as any);
      toast.success(editingId ? t('squad.updated') : t('squad.created'));
      setDialogOpen(false);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success(t('squad.deleted'));
      setDeleteTarget(null);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleExport = () => {
    const rows = filtered.map(p => ({
      [t('squad.name')]: p.name,
      [t('squad.position')]: posShort[p.position as Position] ?? p.position,
      '#': p.jersey_number ?? '',
      [t('squad.nationality')]: translateCountry(p.nationality, i18n.language),
      [t('players.club')]: p.club ?? '',
      [t('players.foot')]: p.foot ?? '',
      [t('players.value')]: p.market_value ?? '',
      [t('squad.age')]: getSquadPlayerAge(p) ?? '',
      [t('squad.contract_end')]: p.contract_end ? new Date(p.contract_end).toLocaleDateString() : '',
      [t('squad.status')]: t(`squad.status_${p.status}`),
      [t('squad.agent')]: p.agent_name,
      [t('squad.agent_phone')]: p.agent_phone,
      [t('squad.agent_email')]: p.agent_email,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Effectif');
    XLSX.writeFile(wb, `effectif_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const getContractBadgeColor = (contractEnd?: string | null) => {
    if (!contractEnd) return 'bg-muted text-muted-foreground';
    const m = getContractMonthsRemaining(contractEnd);
    if (m === null) return 'bg-muted text-muted-foreground';
    if (m < 0) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (m <= 6) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    if (m <= 12) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  };

  const getStatusBadge = (status: SquadPlayerStatus) => {
    const colors: Record<SquadPlayerStatus, string> = {
      active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      injured: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      loaned_out: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      loaned_in: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      suspended: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  // ── Loading / No org ──
  if (orgLoading || isLoading || (orgFetching && !org)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-4">
        <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-bold">{t('squad.title')}</h2>
        <p className="text-muted-foreground">{t('squad.no_org')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('squad.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('squad.subtitle', { name: org.name })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
            <Download className="w-4 h-4 mr-1.5" />
            Excel
          </Button>
          <Button size="sm" onClick={openCreate}>
            <PlusCircle className="w-4 h-4 mr-1.5" />
            {t('squad.add')}
          </Button>
        </div>
      </div>

      {/* KPIs — main */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="card-warm">
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-extrabold tracking-tight">{kpis.total}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('squad.kpi_total')}</p>
          </CardContent>
        </Card>
        <Card className="card-warm">
          <CardContent className="p-5 text-center">
            <p className="text-3xl font-extrabold tracking-tight">{kpis.avgAge !== null ? kpis.avgAge.toFixed(1) : '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('squad.kpi_avg_age')}</p>
          </CardContent>
        </Card>
        <Card className="card-warm">
          <CardContent className="p-5 text-center">
            <p className={cn('text-3xl font-extrabold tracking-tight', kpis.contract12m > 0 && 'text-destructive')}>{kpis.contract12m}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('squad.kpi_expiring_12m')}</p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs — secondary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="card-warm">
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-muted-foreground mb-3">{t('squad.kpi_age_cat')}</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">U23</span><span className="font-bold">{kpis.u23}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">24-30</span><span className="font-bold">{kpis.mid}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">+31</span><span className="font-bold">{kpis.senior}</span></div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-warm">
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-muted-foreground mb-3">{t('squad.kpi_contract_duration')}</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">&lt; 1 an</span><span className="font-bold">{kpis.contractLess1}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">2-3 ans</span><span className="font-bold">{kpis.contract2to3}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">+3 ans</span><span className="font-bold">{kpis.contractPlus3}</span></div>
            </div>
          </CardContent>
        </Card>
        <Card className="card-warm">
          <CardContent className="p-4">
            <p className="text-[11px] font-medium text-muted-foreground mb-3">{t('squad.kpi_loans')}</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t('squad.kpi_loaned_in')}</span><span className="font-bold">{kpis.loanedIn}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t('squad.kpi_loaned_out')}</span><span className="font-bold">{kpis.loanedOut}</span></div>
            </div>
          </CardContent>
        </Card>
        {kpis.newCount > 0 && (
          <Card className="card-warm">
            <CardContent className="p-4">
              <p className="text-[11px] font-medium text-muted-foreground mb-3">{t('squad.kpi_recent')}</p>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-2xl font-extrabold">{kpis.newCount}</span>
                <span className="text-sm text-muted-foreground">{t('squad.kpi_new_players')}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('squad.search_placeholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder={t('squad.filter_status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('squad.all_statuses')}</SelectItem>
            {SQUAD_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{t(`squad.status_${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={positionFilter} onValueChange={setPositionFilter}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder={t('squad.filter_position')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('players.all_positions')}</SelectItem>
            {POSITION_KEYS.map(p => (
              <SelectItem key={p} value={p}>{posLabels[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={v => setSort(v as SortOption)}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">#</SelectItem>
            <SelectItem value="name">{t('squad.name')}</SelectItem>
            <SelectItem value="age">{t('squad.age')}</SelectItem>
            <SelectItem value="position">{t('squad.position')}</SelectItem>
            <SelectItem value="contract">{t('squad.contract_end')}</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} {t('squad.players_count')}
        </span>
      </div>

      {/* Player list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>{players.length === 0 ? t('squad.empty') : t('squad.no_results')}</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map(p => {
            const age = getSquadPlayerAge(p);
            const months = getContractMonthsRemaining(p.contract_end);
            return (
              <Card
                key={p.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setDetailPlayer(p)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  {/* Jersey number */}
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                    {p.jersey_number ?? '—'}
                  </div>

                  {/* Photo */}
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* Name & position */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{p.name}</span>
                      <FlagIcon nationality={p.nationality} size="sm" />
                      {isNewPlayer(p) && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium">{posShort[p.position as Position] ?? p.position}</span>
                      {p.position_secondaire && (
                        <span>/ {posShort[p.position_secondaire as Position] ?? p.position_secondaire}</span>
                      )}
                      {p.club && <span>· {p.club}</span>}
                      {age !== null && <span>· {age} {t('squad.years')}</span>}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap', getStatusBadge(p.status))}>
                    {t(`squad.status_${p.status}`)}
                  </span>

                  {/* Contract badge */}
                  <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap hidden sm:inline-flex', getContractBadgeColor(p.contract_end))}>
                    {p.contract_end ? (
                      months !== null && months < 0
                        ? t('squad.expired')
                        : new Date(p.contract_end).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                    ) : t('squad.no_contract')}
                  </span>

                  {/* Agent */}
                  {p.agent_name && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px] hidden md:inline">
                      {p.agent_name}
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      className="p-1.5 rounded-md hover:bg-muted transition-colors"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                      className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail drawer dialog */}
      <Dialog open={!!detailPlayer} onOpenChange={() => setDetailPlayer(null)}>
        <DialogContent className="max-w-md">
          {detailPlayer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {detailPlayer.photo_url ? (
                    <img src={detailPlayer.photo_url} alt={detailPlayer.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      {detailPlayer.jersey_number && (
                        <span className="text-primary font-bold">#{detailPlayer.jersey_number}</span>
                      )}
                      {detailPlayer.name}
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">{t('squad.position')}</p>
                    <p className="font-medium">{posLabels[detailPlayer.position as Position] ?? detailPlayer.position}</p>
                    {detailPlayer.position_secondaire && (
                      <p className="text-xs text-muted-foreground">{posLabels[detailPlayer.position_secondaire as Position] ?? detailPlayer.position_secondaire}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{t('squad.nationality')}</p>
                    <p className="font-medium flex items-center gap-1">
                      <FlagIcon nationality={detailPlayer.nationality} size="sm" />
                      {translateCountry(detailPlayer.nationality, i18n.language)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{t('squad.age')}</p>
                    <p className="font-medium">
                      {getSquadPlayerAge(detailPlayer) !== null
                        ? `${getSquadPlayerAge(detailPlayer)} ${t('squad.years')}`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{t('squad.status')}</p>
                    <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', getStatusBadge(detailPlayer.status))}>
                      {t(`squad.status_${detailPlayer.status}`)}
                    </span>
                  </div>
                  {detailPlayer.club && (
                    <div>
                      <p className="text-muted-foreground text-xs">{t('players.club')}</p>
                      <p className="font-medium">{detailPlayer.club}</p>
                    </div>
                  )}
                  {detailPlayer.foot && (
                    <div>
                      <p className="text-muted-foreground text-xs">{t('players.foot')}</p>
                      <p className="font-medium">{translateFoot(detailPlayer.foot, t)}</p>
                    </div>
                  )}
                  {detailPlayer.market_value && (
                    <div>
                      <p className="text-muted-foreground text-xs">{t('players.value')}</p>
                      <p className="font-medium">{detailPlayer.market_value}</p>
                    </div>
                  )}
                </div>

                {/* Contract */}
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('squad.contract_info')}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">{t('squad.contract_start')}</p>
                      <p className="font-medium">
                        {detailPlayer.contract_start
                          ? new Date(detailPlayer.contract_start).toLocaleDateString()
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">{t('squad.contract_end')}</p>
                      <p className={cn('font-medium', getContractMonthsRemaining(detailPlayer.contract_end) !== null && getContractMonthsRemaining(detailPlayer.contract_end)! <= 6 ? 'text-red-600' : '')}>
                        {detailPlayer.contract_end
                          ? new Date(detailPlayer.contract_end).toLocaleDateString()
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Agent */}
                {(detailPlayer.agent_name || detailPlayer.agent_phone || detailPlayer.agent_email) && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('squad.agent')}</p>
                    <div className="text-sm space-y-1">
                      {detailPlayer.agent_name && <p className="font-medium">{detailPlayer.agent_name}</p>}
                      {detailPlayer.agent_phone && (
                        <a href={`tel:${detailPlayer.agent_phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                          <Phone className="w-3.5 h-3.5" /> {detailPlayer.agent_phone}
                        </a>
                      )}
                      {detailPlayer.agent_email && (
                        <a href={`mailto:${detailPlayer.agent_email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                          <Mail className="w-3.5 h-3.5" /> {detailPlayer.agent_email}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {detailPlayer.notes && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('squad.notes')}</p>
                    <p className="text-sm whitespace-pre-wrap">{detailPlayer.notes}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => { setDetailPlayer(null); openEdit(detailPlayer); }}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    {t('squad.edit')}
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => { setDetailPlayer(null); setDeleteTarget(detailPlayer); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Player picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('squad.pick_player')}</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('squad.pick_search_placeholder')}
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto -mx-1 space-y-1 min-h-0 max-h-[50vh]">
            {pickerFiltered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('squad.pick_no_results')}</p>
            ) : (
              pickerFiltered.map(p => {
                const age = getPlayerAge(p.generation, (p as any).date_of_birth);
                const checked = pickerSelected.has(p.id);
                return (
                  <button
                    key={p.id}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted/70 transition-colors text-left',
                      checked && 'bg-primary/5 ring-1 ring-primary/20',
                    )}
                    onClick={() => togglePickerSelect(p.id)}
                  >
                    <Checkbox checked={checked} className="shrink-0" tabIndex={-1} />
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium truncate">{p.name}</span>
                        <FlagIcon nationality={p.nationality} size="sm" />
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span>{posShort[p.position as Position] ?? p.position}</span>
                        {p.club && <span>· {p.club}</span>}
                        {age != null && <span>· {age} {t('squad.years')}</span>}
                      </div>
                    </div>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                      p._source === 'personal'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    )}>
                      {p._source === 'personal' ? t('squad.source_personal') : t('squad.source_org')}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t pt-3 space-y-2">
            {pickerSelected.size > 0 && (
              <Button className="w-full" onClick={handleBulkAdd} disabled={bulkAdding}>
                {bulkAdding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('squad.bulk_add_btn', { count: pickerSelected.size })}
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={openManualCreate}>
              <UserPlus className="w-4 h-4 mr-2" />
              {t('squad.manual_entry')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t('squad.edit') : t('squad.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Photo */}
            <div className="flex justify-center">
              <PhotoUpload
                currentUrl={form.photo_url || undefined}
                onPhotoChange={url => setForm(f => ({ ...f, photo_url: url }))}
              />
            </div>

            {/* Identity */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{t('squad.name')} *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label>{t('squad.jersey_number')}</Label>
                <Input type="number" value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))} />
              </div>
              <div>
                <Label>{t('squad.date_of_birth')}</Label>
                <Input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
              </div>
              <div>
                <Label>{t('squad.nationality')}</Label>
                <Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} />
              </div>
              <div>
                <Label>{t('players.club')}</Label>
                <Input value={form.club} onChange={e => setForm(f => ({ ...f, club: e.target.value }))} />
              </div>
              <div>
                <Label>{t('players.foot')}</Label>
                <Input value={form.foot} onChange={e => setForm(f => ({ ...f, foot: e.target.value }))} />
              </div>
              <div>
                <Label>{t('players.value')}</Label>
                <Input value={form.market_value} onChange={e => setForm(f => ({ ...f, market_value: e.target.value }))} />
              </div>
              <div>
                <Label>{t('squad.status')}</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as SquadPlayerStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SQUAD_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{t(`squad.status_${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Position */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('squad.position')} *</Label>
                <Select value={form.position} onValueChange={v => setForm(f => ({ ...f, position: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POSITION_KEYS.map(p => (
                      <SelectItem key={p} value={p}>{posLabels[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('squad.position_secondaire')}</Label>
                <Select value={form.position_secondaire || '_none'} onValueChange={v => setForm(f => ({ ...f, position_secondaire: v === '_none' ? '' : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">—</SelectItem>
                    {POSITION_KEYS.map(p => (
                      <SelectItem key={p} value={p}>{posLabels[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contract */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('squad.contract_start')}</Label>
                <Input type="date" value={form.contract_start} onChange={e => setForm(f => ({ ...f, contract_start: e.target.value }))} />
              </div>
              <div>
                <Label>{t('squad.contract_end')}</Label>
                <Input type="date" value={form.contract_end} onChange={e => setForm(f => ({ ...f, contract_end: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>{t('squad.monthly_salary')}</Label>
                <Input type="number" value={form.monthly_salary} onChange={e => setForm(f => ({ ...f, monthly_salary: e.target.value }))} placeholder="EUR" />
              </div>
            </div>

            {/* Agent */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('squad.agent')}</p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>{t('squad.agent_name')}</Label>
                  <Input value={form.agent_name} onChange={e => setForm(f => ({ ...f, agent_name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('squad.agent_phone')}</Label>
                    <Input value={form.agent_phone} onChange={e => setForm(f => ({ ...f, agent_phone: e.target.value }))} />
                  </div>
                  <div>
                    <Label>{t('squad.agent_email')}</Label>
                    <Input type="email" value={form.agent_email} onChange={e => setForm(f => ({ ...f, agent_email: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>{t('squad.notes')}</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>

            <Button className="w-full" onClick={handleSubmit} disabled={upsert.isPending}>
              {upsert.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? t('squad.save') : t('squad.add')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('squad.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('squad.delete_desc', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('squad.delete_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
