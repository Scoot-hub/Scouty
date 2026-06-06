import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Loader2, ArrowLeft, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  METRIC_BY_KEY, POSITION_LABELS, DEFAULT_DISPLAY_METRICS, DEFAULT_DISPLAY_FALLBACK,
  groupForPosition, fmtMetric, percentileColor, useMetricLabel, API_BASE,
} from '@/lib/wyscout-metrics';

const MINUTES_OPTIONS = [0, 300, 600, 900, 1200, 1500];

interface SearchPlayer { id: string; name: string; club: string | null; position: string | null; league?: string | null; }
interface ProjMetric { metric: string; value: number | null; adjusted: number | null; pctRaw: number | null; pctAdjusted: number | null; }
interface ProjResponse {
  player: { player_id: string; name: string; position: string | null; club: string | null; league: string | null; season: string | null; division: string | null };
  group: string | null; targetDivision: string; season: string | null; adjust: number; cohortSize: number; avgFit: number | null; metrics: ProjMetric[];
}

function useDebounce<T>(value: T, delay = 250): T {
  const [d, setD] = useState(value);
  useEffect(() => { const tm = setTimeout(() => setD(value), delay); return () => clearTimeout(tm); }, [value, delay]);
  return d;
}

function PlayerPicker({ player, onPick, onClear }: { player: SearchPlayer | null; onPick: (p: SearchPlayer) => void; onClear: () => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const dq = useDebounce(q);
  const { data, isFetching } = useQuery<{ results: SearchPlayer[] }>({
    queryKey: ['wyscout-search', dq],
    queryFn: async () => {
      const params = new URLSearchParams({ q: dq, limit: '20' });
      const res = await fetch(`${API_BASE}/wyscout/search?${params}`, { credentials: 'include' });
      if (!res.ok) return { results: [] };
      return res.json();
    },
    enabled: dq.length > 1 && !player,
    staleTime: 60 * 1000,
  });

  if (player) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{player.name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{POSITION_LABELS[player.position || ''] || player.position || '—'} · {player.club || '—'}</p>
        </div>
        <button onClick={onClear} className="w-7 h-7 rounded hover:bg-muted text-muted-foreground flex items-center justify-center"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t('data.search_player', 'Rechercher un joueur…')} className="h-9 pl-8 text-sm" />
      {dq.length > 1 && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
          {isFetching ? (
            <p className="p-3 text-xs text-muted-foreground text-center flex items-center justify-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {t('data.searching', 'Recherche…')}</p>
          ) : (data?.results ?? []).length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">{t('data.no_player', 'Aucun joueur')}</p>
          ) : (
            (data?.results ?? []).map(p => (
              <button key={p.id} onClick={() => { onPick(p); setQ(''); }} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{POSITION_LABELS[p.position || ''] || p.position || '—'} · {p.club || '—'}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function DataProjection() {
  const { t } = useTranslation();
  const { label: mLabel } = useMetricLabel();
  const [searchParams, setSearchParams] = useSearchParams();

  const [player, setPlayer] = useState<SearchPlayer | null>(null);
  const [division, setDivision] = useState(searchParams.get('division') || '');
  const [minMinutes, setMinMinutes] = useState(parseInt(searchParams.get('min') || '') || 600);
  const [adjustPct, setAdjustPct] = useState(parseInt(searchParams.get('adjust') || '') || 0); // 0..50 (%)

  const group = useMemo(() => player ? groupForPosition(player.position)?.key ?? null : null, [player]);
  const metrics = useMemo(() => group ? (DEFAULT_DISPLAY_METRICS[group] || DEFAULT_DISPLAY_FALLBACK) : DEFAULT_DISPLAY_FALLBACK, [group]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (player) p.set('player', player.id);
    if (division) p.set('division', division);
    if (minMinutes) p.set('min', String(minMinutes));
    if (adjustPct) p.set('adjust', String(adjustPct));
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, division, minMinutes, adjustPct]);

  // Divisions list
  const { data: divData } = useQuery<{ divisions: { division: string; count: number }[] }>({
    queryKey: ['wyscout-divisions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/divisions`, { credentials: 'include' });
      if (!res.ok) return { divisions: [] };
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  // Hydrate player from URL once
  const urlPlayerId = searchParams.get('player');
  const { data: hydrated } = useQuery<{ player: SearchPlayer } | null>({
    queryKey: ['wyscout-player-min', urlPlayerId],
    queryFn: async () => {
      if (!urlPlayerId) return null;
      const res = await fetch(`${API_BASE}/wyscout/players/${urlPlayerId}`, { credentials: 'include' });
      if (!res.ok) return null;
      const j = await res.json();
      return { player: { id: j.player.id, name: j.player.name, club: j.player.club, position: j.player.position, league: j.player.league } };
    },
    enabled: !!urlPlayerId && !player,
    staleTime: 60 * 1000,
  });
  useEffect(() => { if (hydrated?.player && !player) setPlayer(hydrated.player); }, [hydrated, player]);

  const body = useMemo(() => ({
    playerId: player?.id, division, minMinutes, adjust: adjustPct / 100, metrics,
  }), [player, division, minMinutes, adjustPct, metrics]);

  const { data, isFetching, isError } = useQuery<ProjResponse>({
    queryKey: ['wyscout-projection', JSON.stringify(body)],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/projection`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('projection failed');
      return res.json();
    },
    enabled: !!player && !!division,
    staleTime: 60 * 1000,
  });

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <Link to="/data"><ArrowLeft className="w-4 h-4" /> {t('data.back_hub', 'Data')}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-rose-500" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">{t('data.projection_title', 'Projection dans un championnat')}</h1>
            <p className="text-xs text-muted-foreground">{t('data.projection_subtitle', 'Où se situeraient les stats d\'un joueur dans un autre championnat.')}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <Card className="card-warm">
        <CardContent className="py-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.player', 'Joueur')}</label>
              <PlayerPicker player={player} onPick={setPlayer} onClear={() => setPlayer(null)} />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.target_division', 'Championnat cible')}</label>
              <Select value={division || '__none__'} onValueChange={v => setDivision(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t('data.pick_division', 'Choisir un championnat')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">{t('data.pick_division', 'Choisir un championnat')}</SelectItem>
                  {(divData?.divisions ?? []).map(d => <SelectItem key={d.division} value={d.division} className="text-xs">{d.division} <span className="text-muted-foreground">({d.count})</span></SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.min_minutes', 'Minutes min')}</label>
              <Select value={String(minMinutes)} onValueChange={v => setMinMinutes(Number(v))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{MINUTES_OPTIONS.map(m => <SelectItem key={m} value={String(m)} className="text-xs">≥ {m}'</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">
                {t('data.level_gap', 'Écart de niveau')} : <span className="font-semibold text-foreground">-{adjustPct}%</span>
              </label>
              <input type="range" min={0} max={50} step={5} value={adjustPct} onChange={e => setAdjustPct(Number(e.target.value))} className="w-full accent-rose-500 mt-2" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {t('data.projection_hint', 'L\'écart de niveau applique une décote sur les stats de volume (pas les %) pour simuler un championnat plus relevé.')}
          </p>
        </CardContent>
      </Card>

      {/* Result */}
      {!player || !division ? (
        <Card className="card-warm"><CardContent className="py-12 text-center text-sm text-muted-foreground">
          {t('data.projection_empty', 'Choisissez un joueur et un championnat cible.')}
        </CardContent></Card>
      ) : isError ? (
        <Card className="card-warm"><CardContent className="py-12 text-center text-sm text-muted-foreground">{t('data.error', 'Erreur lors du calcul.')}</CardContent></Card>
      ) : isFetching && !data ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : data ? (
        <Card className="card-warm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm">
                {data.player.name} <span className="text-muted-foreground">→ {data.targetDivision}</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                {data.avgFit != null && (
                  <Badge variant="outline" className="text-[11px] gap-1">
                    {t('data.avg_fit', 'Adéquation moyenne')} : <span className={cn('font-bold', data.avgFit >= 60 ? 'text-emerald-600' : data.avgFit >= 40 ? 'text-amber-600' : 'text-red-500')}>{data.avgFit}</span>
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">{t('data.cohort_n', 'n={{n}}', { n: data.cohortSize })}</Badge>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('data.projection_player_ctx', 'Données de référence : {{season}} · {{div}}', { season: data.player.season || '—', div: data.player.division || data.player.league || '—' })}
            </p>
          </CardHeader>
          <CardContent>
            {data.cohortSize === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t('data.projection_no_cohort', 'Pas assez de données dans ce championnat pour ce poste.')}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-semibold">{t('data.stat', 'Statistique')}</th>
                      <th className="text-center px-2 py-2 font-semibold">{t('data.value', 'Valeur')}</th>
                      {adjustPct > 0 && <th className="text-center px-2 py-2 font-semibold">{t('data.adjusted', 'Ajustée')}</th>}
                      <th className="text-left px-3 py-2 font-semibold w-44">{t('data.percentile_target', 'Percentile (cible)')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.metrics.map(m => {
                      const def = METRIC_BY_KEY[m.metric];
                      const pct = adjustPct > 0 ? m.pctAdjusted : m.pctRaw;
                      return (
                        <tr key={m.metric} className="border-t border-border/30">
                          <td className="px-3 py-2 font-medium">{mLabel(m.metric)}</td>
                          <td className="text-center px-2 py-2 tabular-nums">{fmtMetric(m.value, def)}</td>
                          {adjustPct > 0 && <td className="text-center px-2 py-2 tabular-nums text-muted-foreground">{fmtMetric(m.adjusted, def)}</td>}
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[120px]">
                                <div className={cn('h-full', percentileColor(pct))} style={{ width: pct == null ? '0%' : `${pct}%` }} />
                              </div>
                              <span className="font-semibold tabular-nums w-7">{pct ?? '—'}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
