import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SlidersHorizontal, Loader2, X, ChevronLeft, ChevronRight, ArrowLeft,
  Search, Link2, Percent, Hash, ArrowUpDown, Settings2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { StatPickerDialog } from '@/components/wyscout/StatPickerDialog';
import {
  METRIC_BY_KEY, POSITION_GROUPS, POSITION_LABELS, FOOT_OPTIONS,
  DEFAULT_DISPLAY_METRICS, DEFAULT_DISPLAY_FALLBACK,
  fmtMetric, percentileColor, useMetricLabel, API_BASE,
} from '@/lib/wyscout-metrics';

type Mode = 'abs' | 'pct';
type Op = 'gte' | 'lte';
interface Threshold { mode: Mode; op: Op; value: string }

interface ExploreRow {
  player_id: string;
  name: string;
  position: string | null;
  club: string | null;
  league: string | null;
  photo_url: string | null;
  age: number | null;
  foot: string | null;
  market_value: string | null;
  season: string | null;
  team: string | null;
  minutes_played: number | null;
  percentiles: Record<string, number | null>;
  values: Record<string, number | null>;
}

const PAGE_SIZE = 25;
const MINUTES_OPTIONS = [0, 300, 600, 900, 1200, 1500, 1800];
const defaultStatsFor = (group: string) => DEFAULT_DISPLAY_METRICS[group] || DEFAULT_DISPLAY_FALLBACK;

// ── URL (de)serialization ───────────────────────────────────────────────────
interface ExploreState {
  group: string;
  league: string;
  minAge: string;
  maxAge: string;
  minMinutes: number;
  season: string;
  feet: string[];
  selectedStats: string[];
  thresholds: Record<string, Threshold>;
  sortMetric: string;
  sortMode: Mode;
  sortDir: 'asc' | 'desc';
}

function stateToParams(s: ExploreState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.group) p.set('g', s.group);
  if (s.league) p.set('league', s.league);
  if (s.minAge) p.set('amin', s.minAge);
  if (s.maxAge) p.set('amax', s.maxAge);
  if (s.minMinutes) p.set('min', String(s.minMinutes));
  if (s.season) p.set('season', s.season);
  if (s.feet.length) p.set('foot', s.feet.join(','));
  if (s.selectedStats.length) p.set('cols', s.selectedStats.join(','));
  const thr = Object.entries(s.thresholds).filter(([, v]) => v.value !== '');
  if (thr.length) p.set('c', thr.map(([m, v]) => `${m}~${v.mode}~${v.op}~${v.value}`).join(';'));
  if (s.sortMetric) { p.set('sm', s.sortMetric); p.set('smode', s.sortMode); p.set('sdir', s.sortDir); }
  return p;
}
function paramsToState(p: URLSearchParams): ExploreState {
  const group = p.get('g') || 'ATT';
  const cols = (p.get('cols') || '').split(',').map(s => s.trim()).filter(k => METRIC_BY_KEY[k]);
  const thresholds: Record<string, Threshold> = {};
  (p.get('c') || '').split(';').filter(Boolean).forEach(seg => {
    const [metric, mode, op, value] = seg.split('~');
    if (METRIC_BY_KEY[metric]) thresholds[metric] = { mode: mode === 'pct' ? 'pct' : 'abs', op: op === 'lte' ? 'lte' : 'gte', value: value ?? '' };
  });
  return {
    group,
    league: p.get('league') || '',
    minAge: p.get('amin') || '',
    maxAge: p.get('amax') || '',
    minMinutes: parseInt(p.get('min') || '') || 600,
    season: p.get('season') || '',
    feet: (p.get('foot') || '').split(',').filter(Boolean),
    selectedStats: cols.length ? cols : defaultStatsFor(group),
    thresholds,
    sortMetric: p.get('sm') || '',
    sortMode: p.get('smode') === 'pct' ? 'pct' : 'abs',
    sortDir: p.get('sdir') === 'asc' ? 'asc' : 'desc',
  };
}

export default function DataExplore() {
  const { t } = useTranslation();
  const { label: mLabel } = useMetricLabel();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<ExploreState>(() => paramsToState(searchParams));
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setSearchParams(stateToParams(state), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const patch = (p: Partial<ExploreState>) => { setState(s => ({ ...s, ...p })); setPage(1); };

  // Season options
  const { data: seasonsData } = useQuery<{ seasons: { season: string; count: number }[] }>({
    queryKey: ['wyscout-seasons'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/seasons`, { credentials: 'include' });
      if (!res.ok) return { seasons: [] };
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const onGroupChange = (group: string) => {
    setState(s => {
      const selectedStats = defaultStatsFor(group);
      const thresholds: Record<string, Threshold> = {};
      for (const k of selectedStats) if (s.thresholds[k]) thresholds[k] = s.thresholds[k];
      return { ...s, group, selectedStats, thresholds };
    });
    setPage(1);
  };

  const onPickStats = (stats: string[]) => {
    setState(s => {
      const thresholds: Record<string, Threshold> = {};
      for (const k of stats) if (s.thresholds[k]) thresholds[k] = s.thresholds[k];
      return { ...s, selectedStats: stats, thresholds };
    });
    setPage(1);
  };

  const setThreshold = (metric: string, p: Partial<Threshold>) =>
    setState(s => ({ ...s, thresholds: { ...s.thresholds, [metric]: { mode: 'abs', op: 'gte', value: '', ...s.thresholds[metric], ...p } } }));
  const clearThreshold = (metric: string) =>
    setState(s => { const { [metric]: _drop, ...rest } = s.thresholds; return { ...s, thresholds: rest }; });

  const body = useMemo(() => ({
    group: state.group,
    season: state.season || undefined,
    league: state.league || undefined,
    minMinutes: state.minMinutes,
    minAge: state.minAge ? Number(state.minAge) : undefined,
    maxAge: state.maxAge ? Number(state.maxAge) : undefined,
    feet: state.feet,
    filters: Object.entries(state.thresholds)
      .filter(([, v]) => v.value !== '' && Number.isFinite(Number(v.value)))
      .map(([metric, v]) => ({ metric, mode: v.mode, op: v.op, value: Number(v.value) })),
    displayMetrics: state.selectedStats,
    sortMetric: state.sortMetric || undefined,
    sortMode: state.sortMode,
    sortDir: state.sortDir,
    page,
    pageSize: PAGE_SIZE,
  }), [state, page]);

  const { data, isFetching, isError } = useQuery<{ total: number; cohortSize: number; results: ExploreRow[] }>({
    queryKey: ['wyscout-explore', JSON.stringify(body)],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/explore`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('explore failed');
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
  });

  const toggleFoot = (f: string) =>
    patch({ feet: state.feet.includes(f) ? state.feet.filter(x => x !== f) : [...state.feet, f] });

  const setSort = (metric: string) => {
    setState(s => s.sortMetric === metric
      ? { ...s, sortDir: s.sortDir === 'desc' ? 'asc' : 'desc' }
      : { ...s, sortMetric: metric, sortMode: 'abs', sortDir: 'desc' });
    setPage(1);
  };

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?${stateToParams(state).toString()}`;
    try { await navigator.clipboard.writeText(url); toast({ title: t('data.link_copied', 'Lien copié') }); }
    catch { window.prompt(t('data.copy_link', 'Copiez le lien :'), url); }
  }, [state, toast, t]);

  const results = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeThresholds = Object.entries(state.thresholds).filter(([, v]) => v.value !== '').length;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <Link to="/data"><ArrowLeft className="w-4 h-4" /> {t('data.back_hub', 'Data')}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <SlidersHorizontal className="w-4 h-4 text-violet-500" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">{t('data.explore_title', 'Recherche par data')}</h1>
            <p className="text-xs text-muted-foreground">{t('data.explore_subtitle', 'Trouvez des joueurs à partir de leurs statistiques.')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs" onClick={copyLink}>
          <Link2 className="w-3.5 h-3.5" /> {t('data.share', 'Partager')}
        </Button>
      </div>

      {/* Filters */}
      <Card className="card-warm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Search className="w-4 h-4 text-violet-500" /> {t('data.filters', 'Filtres')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Base filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.position', 'Poste')}</label>
              <Select value={state.group} onValueChange={onGroupChange}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POSITION_GROUPS.map(g => <SelectItem key={g.key} value={g.key} className="text-xs">{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.season', 'Saison')}</label>
              <Select value={state.season || '__all__'} onValueChange={v => patch({ season: v === '__all__' ? '' : v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs">{t('data.all_seasons', 'Toutes saisons')}</SelectItem>
                  {(seasonsData?.seasons ?? []).map(s => <SelectItem key={s.season} value={s.season} className="text-xs">{s.season}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.league', 'Ligue')}</label>
              <Input value={state.league} onChange={e => patch({ league: e.target.value })} placeholder={t('data.league_ph', 'ex. Ligue 2')} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.age_min', 'Âge min')}</label>
              <Input type="number" value={state.minAge} onChange={e => patch({ minAge: e.target.value })} placeholder="—" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.age_max', 'Âge max')}</label>
              <Input type="number" value={state.maxAge} onChange={e => patch({ maxAge: e.target.value })} placeholder="—" className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.min_minutes', 'Minutes min')}</label>
              <Select value={String(state.minMinutes)} onValueChange={v => patch({ minMinutes: Number(v) })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MINUTES_OPTIONS.map(m => <SelectItem key={m} value={String(m)} className="text-xs">≥ {m}'</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Foot */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase text-muted-foreground">{t('data.foot', 'Pied')} :</span>
            {FOOT_OPTIONS.map(f => (
              <button key={f} onClick={() => toggleFoot(f)}
                className={cn('text-[11px] px-2 h-7 rounded border transition-colors',
                  state.feet.includes(f) ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border hover:bg-muted')}>{f}</button>
            ))}
          </div>

          {/* Selected stats + thresholds */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase">
                {t('data.stats_shown', 'Statistiques affichées')} ({state.selectedStats.length})
                {activeThresholds > 0 && <span className="ml-1 normal-case font-normal">· {t('data.n_filters', '{{n}} filtre(s)', { n: activeThresholds })}</span>}
              </span>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1" onClick={() => setPickerOpen(true)}>
                <Settings2 className="w-3 h-3" /> {t('data.choose_stats', 'Choisir les stats')}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">{t('data.threshold_hint', 'Chaque stat est une colonne. Renseignez un seuil pour filtrer (vide = simple affichage).')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {state.selectedStats.map(metric => {
                const def = METRIC_BY_KEY[metric];
                const th = state.thresholds[metric] || { mode: 'abs' as Mode, op: 'gte' as Op, value: '' };
                return (
                  <div key={metric} className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/60 bg-card">
                    <span className="text-[11px] flex-1 truncate" title={mLabel(metric)}>{mLabel(metric)}</span>
                    <div className="flex rounded-md border border-border overflow-hidden">
                      <button onClick={() => setThreshold(metric, { mode: 'abs' })}
                        className={cn('px-1.5 h-7 text-[10px] flex items-center', th.mode === 'abs' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} title={t('data.value', 'Valeur')}><Hash className="w-3 h-3" /></button>
                      <button onClick={() => setThreshold(metric, { mode: 'pct' })}
                        className={cn('px-1.5 h-7 text-[10px] flex items-center', th.mode === 'pct' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} title={t('data.percentile', 'Percentile')}><Percent className="w-3 h-3" /></button>
                    </div>
                    <button onClick={() => setThreshold(metric, { op: th.op === 'gte' ? 'lte' : 'gte' })}
                      className="px-1.5 h-7 text-xs rounded border border-border hover:bg-muted w-7" title={th.op === 'gte' ? '≥' : '≤'}>{th.op === 'gte' ? '≥' : '≤'}</button>
                    <Input type="number" value={th.value} onChange={e => setThreshold(metric, { value: e.target.value })}
                      placeholder={th.mode === 'pct' ? '0-100' : (def?.isPct ? '%' : 'val')} className="h-7 w-16 text-xs px-1.5" />
                    {th.value !== '' && (
                      <button onClick={() => clearThreshold(metric)} className="w-6 h-7 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex items-center justify-center" title={t('data.clear_filter', 'Effacer le filtre')}><X className="w-3 h-3" /></button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="card-warm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {t('data.results', 'Résultats')}
              {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /> : <Badge variant="outline" className="text-[10px]">{total}</Badge>}
            </CardTitle>
            <span className="text-[10px] text-muted-foreground">
              {data?.cohortSize ? t('data.cohort_info', 'Percentiles vs {{n}} joueurs au poste', { n: data.cohortSize }) : ''}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isError ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t('data.error', 'Erreur lors de la recherche.')}</p>
          ) : results.length === 0 && !isFetching ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t('data.no_results', 'Aucun joueur ne correspond à ces critères.')}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground">
                    <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-muted/50">{t('data.player', 'Joueur')}</th>
                    <th className="text-left px-2 py-2 font-semibold">{t('data.season', 'Saison')}</th>
                    <th className="text-center px-2 py-2 font-semibold">{t('data.age', 'Âge')}</th>
                    <th className="text-center px-2 py-2 font-semibold">Min</th>
                    {state.selectedStats.map(m => {
                      const sorted = state.sortMetric === m;
                      return (
                        <th key={m} className="text-center px-2 py-2 font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => setSort(m)} title={mLabel(m)}>
                          <div className="flex items-center justify-center gap-1">
                            <span className="truncate max-w-[90px]">{mLabel(m)}</span>
                            <ArrowUpDown className={cn('w-3 h-3', sorted ? 'opacity-100' : 'opacity-30')} />
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => (
                    <tr key={r.player_id} className="border-t border-border/30 hover:bg-muted/20">
                      <td className="px-3 py-2 sticky left-0 bg-background">
                        <Link to={`/data/player/${r.player_id}`} className="flex items-center gap-2 min-w-0 hover:underline">
                          {r.photo_url
                            ? <img src={r.photo_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                            : <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[8px] font-bold text-muted-foreground shrink-0">{r.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()}</div>}
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[150px]">{r.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">{POSITION_LABELS[r.position || ''] || r.position || '—'} · {r.club || '—'}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground whitespace-nowrap">
                        <div className="font-medium text-foreground">{r.season || '—'}</div>
                        <div className="truncate max-w-[110px]">{r.team || r.division || ''}</div>
                      </td>
                      <td className="text-center px-2 py-2 tabular-nums">{r.age ?? '—'}</td>
                      <td className="text-center px-2 py-2 tabular-nums text-muted-foreground">{r.minutes_played ?? '—'}</td>
                      {state.selectedStats.map(m => {
                        const def = METRIC_BY_KEY[m];
                        const pct = r.percentiles?.[m];
                        return (
                          <td key={m} className="px-2 py-2">
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="tabular-nums font-medium">{fmtMetric(r.values?.[m], def)}</span>
                              <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                                <div className={cn('h-full', percentileColor(pct))} style={{ width: pct == null ? '0%' : `${pct}%` }} />
                              </div>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right">
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[10px]">
                          <Link to={`/data/player/${r.player_id}`}>{t('data.view', 'Voir')}</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-3">
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="w-3.5 h-3.5" /> {t('data.prev', 'Précédent')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('data.page_of', 'Page {{p}} / {{n}}', { p: page, n: totalPages })}</span>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                {t('data.next', 'Suivant')} <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <StatPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} selected={state.selectedStats} onChange={onPickStats} title={t('data.choose_stats', 'Choisir les stats')} />
    </div>
  );
}
