import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { ScatterChart as ScatterIcon, Loader2, ArrowLeft, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  METRICS, METRIC_BY_KEY, POSITION_GROUPS, POSITION_LABELS,
  num, fmtMetric, parseMarketValue, useMetricLabel, API_BASE, type MetricCat,
} from '@/lib/wyscout-metrics';

const MINUTES_OPTIONS = [0, 300, 600, 900, 1200, 1500, 1800];
const MAX_POINTS = 1200;
const POINT_COLORS = ['#3b82f6', '#ec4899', '#22c55e', '#f97316', '#8b5cf6', '#06b6d4', '#eab308', '#ef4444', '#14b8a6', '#a855f7'];

const METRICS_BY_CAT = (() => {
  const out: Record<string, typeof METRICS> = {};
  for (const m of METRICS) (out[m.cat] ||= []).push(m);
  return out;
})();
const CAT_ORDER: MetricCat[] = ['attack', 'passing', 'defense', 'physical', 'set', 'gk', 'volume'];

function MetricSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { label, catLabel } = useMetricLabel();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {CAT_ORDER.filter(c => METRICS_BY_CAT[c]?.length).map(cat => (
          <SelectGroup key={cat}>
            <SelectLabel className="text-[10px] uppercase">{catLabel(cat)}</SelectLabel>
            {METRICS_BY_CAT[cat].map(m => <SelectItem key={m.key as string} value={m.key as string} className="text-xs">{label(m.key as string)}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

type ColorBy = 'position' | 'foot' | 'none';
type SizeBy = 'minutes' | 'value' | 'none';

interface CohortRow {
  player_id: string;
  name: string;
  player_position: string | null;
  club: string | null;
  league: string | null;
  foot: string | null;
  season: string | null;
  team: string | null;
  market_value: string | null;
  minutes_played: number | null;
  [k: string]: unknown;
}

export default function DataScatter() {
  const { t } = useTranslation();
  const { label: mLabel } = useMetricLabel();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [group, setGroup] = useState(searchParams.get('g') || 'ATT');
  const [xKey, setXKey] = useState(searchParams.get('x') || 'xg_per90');
  const [yKey, setYKey] = useState(searchParams.get('y') || 'xa_per90');
  const [minMinutes, setMinMinutes] = useState(parseInt(searchParams.get('min') || '') || 900);
  const [season, setSeason] = useState(searchParams.get('season') || '');
  const [colorBy, setColorBy] = useState<ColorBy>((searchParams.get('color') as ColorBy) || 'position');
  const [sizeBy, setSizeBy] = useState<SizeBy>((searchParams.get('size') as SizeBy) || 'minutes');
  const [xMin, setXMin] = useState(searchParams.get('xmin') || '');
  const [xMax, setXMax] = useState(searchParams.get('xmax') || '');
  const [yMin, setYMin] = useState(searchParams.get('ymin') || '');
  const [yMax, setYMax] = useState(searchParams.get('ymax') || '');

  useEffect(() => {
    const p = new URLSearchParams();
    p.set('g', group); p.set('x', xKey); p.set('y', yKey); p.set('min', String(minMinutes));
    p.set('color', colorBy); p.set('size', sizeBy);
    if (season) p.set('season', season);
    if (xMin) p.set('xmin', xMin); if (xMax) p.set('xmax', xMax);
    if (yMin) p.set('ymin', yMin); if (yMax) p.set('ymax', yMax);
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, xKey, yKey, minMinutes, colorBy, sizeBy, season, xMin, xMax, yMin, yMax]);

  const { data: seasonsData } = useQuery<{ seasons: { season: string; count: number }[] }>({
    queryKey: ['wyscout-seasons'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/seasons`, { credentials: 'include' });
      if (!res.ok) return { seasons: [] };
      return res.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data, isFetching, isError } = useQuery<{ count: number; rows: CohortRow[] }>({
    queryKey: ['wyscout-cohort', group, minMinutes, season],
    queryFn: async () => {
      const params = new URLSearchParams({ group, minMinutes: String(minMinutes), limit: '3000' });
      if (season) params.set('season', season);
      const res = await fetch(`${API_BASE}/wyscout/cohort?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('cohort failed');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const xDef = METRIC_BY_KEY[xKey];
  const yDef = METRIC_BY_KEY[yKey];
  const xMinN = xMin !== '' ? Number(xMin) : null;
  const xMaxN = xMax !== '' ? Number(xMax) : null;
  const yMinN = yMin !== '' ? Number(yMin) : null;
  const yMaxN = yMax !== '' ? Number(yMax) : null;

  const { points, meanX, meanY, colorKeys } = useMemo(() => {
    const rows = data?.rows ?? [];
    const pts = rows.map(r => {
      const x = num(r[xKey]);
      const y = num(r[yKey]);
      if (x == null || y == null) return null;
      if (xMinN != null && x < xMinN) return null;
      if (xMaxN != null && x > xMaxN) return null;
      if (yMinN != null && y < yMinN) return null;
      if (yMaxN != null && y > yMaxN) return null;
      let z = 100;
      if (sizeBy === 'minutes') z = num(r.minutes_played) ?? 100;
      else if (sizeBy === 'value') z = parseMarketValue(r.market_value) ?? 0;
      const colorKey = colorBy === 'position' ? (r.player_position || '—') : colorBy === 'foot' ? (r.foot || '—') : 'all';
      return {
        player_id: r.player_id, name: r.name, club: r.club, league: r.league,
        position: r.player_position, season: r.season, team: r.team, x, y, z: z || 1, colorKey,
      };
    }).filter(Boolean) as Array<{ player_id: string; name: string; club: string | null; league: string | null; position: string | null; season: string | null; team: string | null; x: number; y: number; z: number; colorKey: string }>;

    pts.sort((a, b) => b.z - a.z);
    const capped = pts.slice(0, MAX_POINTS);
    const mx = capped.length ? capped.reduce((s, p) => s + p.x, 0) / capped.length : 0;
    const my = capped.length ? capped.reduce((s, p) => s + p.y, 0) / capped.length : 0;
    const keys = Array.from(new Set(capped.map(p => p.colorKey)));
    return { points: capped, meanX: mx, meanY: my, colorKeys: keys };
  }, [data, xKey, yKey, sizeBy, colorBy, xMinN, xMaxN, yMinN, yMaxN]);

  const colorFor = useCallback((key: string) => {
    if (colorBy === 'none') return POINT_COLORS[0];
    const idx = colorKeys.indexOf(key);
    return POINT_COLORS[idx % POINT_COLORS.length];
  }, [colorKeys, colorBy]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    try { await navigator.clipboard.writeText(url); toast({ title: t('data.link_copied', 'Lien copié') }); }
    catch { window.prompt(t('data.copy_link', 'Copiez le lien :'), url); }
  }, [toast, t]);

  const xDomain: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'] = [xMinN ?? 'dataMin', xMaxN ?? 'dataMax'];
  const yDomain: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'] = [yMinN ?? 'dataMin', yMaxN ?? 'dataMax'];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <Link to="/data"><ArrowLeft className="w-4 h-4" /> {t('data.back_hub', 'Data')}</Link>
        </Button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
            <ScatterIcon className="w-4 h-4 text-sky-500" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">{t('data.scatter_title', 'Nuage de points')}</h1>
            <p className="text-xs text-muted-foreground">{t('data.scatter_subtitle', 'Croisez deux statistiques sur toute une population.')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5 text-xs" onClick={copyLink}>
          <Link2 className="w-3.5 h-3.5" /> {t('data.share', 'Partager')}
        </Button>
      </div>

      {/* Controls */}
      <Card className="card-warm">
        <CardContent className="py-3 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.position', 'Poste')}</label>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{POSITION_GROUPS.map(g => <SelectItem key={g.key} value={g.key} className="text-xs">{g.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.axis_x', 'Axe X')}</label>
              <MetricSelect value={xKey} onChange={setXKey} />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.axis_y', 'Axe Y')}</label>
              <MetricSelect value={yKey} onChange={setYKey} />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.season', 'Saison')}</label>
              <Select value={season || '__all__'} onValueChange={v => setSeason(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__" className="text-xs">{t('data.all_seasons', 'Toutes saisons')}</SelectItem>
                  {(seasonsData?.seasons ?? []).map(s => <SelectItem key={s.season} value={s.season} className="text-xs">{s.season}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">{t('data.min_minutes', 'Minutes min')}</label>
              <Select value={String(minMinutes)} onValueChange={v => setMinMinutes(Number(v))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{MINUTES_OPTIONS.map(m => <SelectItem key={m} value={String(m)} className="text-xs">≥ {m}'</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">{t('data.color_by', 'Couleur')}</label>
                <Select value={colorBy} onValueChange={v => setColorBy(v as ColorBy)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="position" className="text-xs">{t('data.position', 'Poste')}</SelectItem>
                    <SelectItem value="foot" className="text-xs">{t('data.foot', 'Pied')}</SelectItem>
                    <SelectItem value="none" className="text-xs">{t('data.none', 'Aucune')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">{t('data.size_by', 'Taille')}</label>
                <Select value={sizeBy} onValueChange={v => setSizeBy(v as SizeBy)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes" className="text-xs">{t('data.minutes', 'Minutes')}</SelectItem>
                    <SelectItem value="value" className="text-xs">{t('data.market_value', 'Valeur marchande')}</SelectItem>
                    <SelectItem value="none" className="text-xs">{t('data.none', 'Aucune')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Axis ranges (zoom / granularity) */}
          <div className="flex items-end gap-3 flex-wrap border-t pt-2">
            <span className="text-[10px] uppercase text-muted-foreground pb-2">{t('data.range', 'Plage')}</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground w-4">X</span>
              <Input type="number" value={xMin} onChange={e => setXMin(e.target.value)} placeholder={t('data.min', 'min')} className="h-7 w-16 text-xs px-1.5" />
              <Input type="number" value={xMax} onChange={e => setXMax(e.target.value)} placeholder={t('data.max', 'max')} className="h-7 w-16 text-xs px-1.5" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground w-4">Y</span>
              <Input type="number" value={yMin} onChange={e => setYMin(e.target.value)} placeholder={t('data.min', 'min')} className="h-7 w-16 text-xs px-1.5" />
              <Input type="number" value={yMax} onChange={e => setYMax(e.target.value)} placeholder={t('data.max', 'max')} className="h-7 w-16 text-xs px-1.5" />
            </div>
            {(xMin || xMax || yMin || yMax) && (
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { setXMin(''); setXMax(''); setYMin(''); setYMax(''); }}>
                {t('data.reset', 'Réinitialiser')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="card-warm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">{mLabel(xKey)} <span className="text-muted-foreground">×</span> {mLabel(yKey)}</CardTitle>
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
              <Badge variant="outline" className="text-[10px]">
                {points.length}{(data?.count ?? 0) > points.length ? ` / ${data?.count}` : ''} {t('data.players', 'joueurs')}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="text-sm text-muted-foreground text-center py-16">{t('data.error', 'Erreur lors du chargement.')}</p>
          ) : points.length === 0 && !isFetching ? (
            <p className="text-sm text-muted-foreground text-center py-16">{t('data.no_results', 'Aucune donnée pour ce poste.')}</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={460}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} />
                  <XAxis type="number" dataKey="x" name={mLabel(xKey)} domain={xDomain} allowDataOverflow
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    label={{ value: mLabel(xKey), position: 'insideBottom', offset: -12, fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis type="number" dataKey="y" name={mLabel(yKey)} domain={yDomain} allowDataOverflow
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    label={{ value: mLabel(yKey), angle: -90, position: 'insideLeft', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <ZAxis type="number" dataKey="z" range={sizeBy === 'none' ? [60, 60] : [30, 360]} />
                  <ReferenceLine x={meanX} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <ReferenceLine y={meanY} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as { name: string; club: string | null; position: string | null; season: string | null; team: string | null; x: number; y: number };
                      return (
                        <div className="rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-md">
                          <div className="font-semibold mb-0.5">{p.name}</div>
                          <div className="text-[10px] text-muted-foreground mb-0.5">{POSITION_LABELS[p.position || ''] || p.position || ''} · {p.club || ''}</div>
                          {p.season && <div className="text-[10px] text-muted-foreground mb-1">{p.season}{p.team ? ` · ${p.team}` : ''}</div>}
                          <div className="text-[11px] text-muted-foreground">{mLabel(xKey)}: <span className="text-foreground font-medium tabular-nums">{fmtMetric(p.x, xDef)}</span></div>
                          <div className="text-[11px] text-muted-foreground">{mLabel(yKey)}: <span className="text-foreground font-medium tabular-nums">{fmtMetric(p.y, yDef)}</span></div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={points}
                    onClick={(p: { player_id?: string; payload?: { player_id?: string } }) => {
                      const pid = p?.player_id || p?.payload?.player_id;
                      if (pid) window.open(`/data/player/${pid}`, '_blank', 'noopener');
                    }}
                    className="cursor-pointer"
                  >
                    {points.map(p => <Cell key={p.player_id} fill={colorFor(p.colorKey)} fillOpacity={0.65} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>

              {colorBy !== 'none' && colorKeys.length > 1 && (
                <div className="flex flex-wrap gap-3 justify-center mt-2">
                  {colorKeys.map(k => (
                    <div key={k} className="flex items-center gap-1 text-[10px]">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorFor(k) }} />
                      <span>{colorBy === 'position' ? (POSITION_LABELS[k] || k) : k}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[9px] text-muted-foreground/50 text-center mt-2">
                {t('data.scatter_hint', 'Lignes pointillées = moyenne de la population. Cliquez un point pour ouvrir la fiche dans un nouvel onglet.')}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
