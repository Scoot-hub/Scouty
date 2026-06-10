import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStatsBombPlayer, type SbSeasonStats } from '@/hooks/use-statsbomb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from 'recharts';
import { Target, Swords, Shield, TrendingUp, Info, Database, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';

interface Props {
  player: Player;
}

// Per-90 normalization helpers — assumes ~90 min/match average
const per90 = (val: number, matches: number) =>
  matches > 0 ? +((val / matches)).toFixed(2) : 0;

// Radar config per category
const RADAR_CATEGORIES = {
  attacking: [
    { key: 'xg',             label: 'xG',            max: 1.5 },
    { key: 'shots',          label: 'Tirs',           max: 5 },
    { key: 'shots_on_target',label: 'Cadrés',         max: 3 },
    { key: 'dribbles_completed', label: 'Dribbles',   max: 4 },
    { key: 'key_passes',     label: 'Passes clés',    max: 3 },
    { key: 'progressive_passes', label: 'Passes prog.', max: 6 },
  ],
  defending: [
    { key: 'pressures',      label: 'Pressions',      max: 20 },
    { key: 'tackles',        label: 'Tacles',         max: 5 },
    { key: 'interceptions',  label: 'Interceptions',  max: 3 },
    { key: 'duels_won',      label: 'Duels gagnés',   max: 8 },
    { key: 'passes',         label: 'Passes',         max: 60 },
    { key: 'pass_pct',       label: 'Pass %',         max: 100 },
  ],
} as const;

type Category = keyof typeof RADAR_CATEGORIES;

function StatCard({
  label, value, sub, accent = false, tooltip,
}: {
  label: string; value: string | number; sub?: string; accent?: boolean; tooltip?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'flex flex-col items-center justify-center p-3 rounded-xl border text-center gap-0.5',
            accent ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border/40',
          )}>
            <span className={cn('text-xl font-extrabold tabular-nums', accent && 'text-primary')}>{value}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">{label}</span>
            {sub && <span className="text-[9px] text-muted-foreground/60">{sub}</span>}
          </div>
        </TooltipTrigger>
        {tooltip && <TooltipContent className="text-xs max-w-[200px]">{tooltip}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}

function buildRadarData(stats: SbSeasonStats, category: Category) {
  const axes = RADAR_CATEGORIES[category];
  return axes.map(ax => {
    const raw = stats[ax.key as keyof SbSeasonStats] as number ?? 0;
    const val = ax.key === 'pass_pct' ? raw : per90(raw, stats.matches);
    const pct = Math.min(100, Math.round((val / ax.max) * 100));
    return { axis: ax.label, value: pct, raw: val };
  });
}

export default function StatsBombTab({ player }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useStatsBombPlayer(player.name);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [radarCategory, setRadarCategory] = useState<Category>('attacking');

  // Build season options once data loads
  const seasonOptions = useMemo(() => {
    if (!data?.stats.length) return [];
    return data.stats.map(s => ({
      key: `${s.player_id}-${s.competition_id}-${s.season_id}`,
      label: `${s.competition_name} — ${s.season_name}`,
      stats: s,
    }));
  }, [data]);

  const selected: SbSeasonStats | null = useMemo(() => {
    if (!seasonOptions.length) return null;
    const found = seasonOptions.find(o => o.key === selectedKey);
    if (found) return found.stats;
    return seasonOptions[0].stats; // default: most recent
  }, [seasonOptions, selectedKey]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">{t('statsbomb.loading')}</span>
      </div>
    );
  }

  if (!data?.players.length || !seasonOptions.length) {
    return (
      <Card className="card-warm">
        <CardContent className="py-16 text-center">
          <Database className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm font-medium text-muted-foreground">{t('statsbomb.no_data')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">{t('statsbomb.no_data_hint')}</p>
        </CardContent>
      </Card>
    );
  }

  const radarData = selected ? buildRadarData(selected, radarCategory) : [];

  // Career totals
  const totalGoals = data.stats.reduce((s, r) => s + r.goals, 0);
  const totalXg    = data.stats.reduce((s, r) => s + r.xg, 0);
  const totalMatches = data.stats.reduce((s, r) => s + r.matches, 0);

  return (
    <div className="space-y-5">
      {/* Attribution */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
        <Info className="w-3 h-3 shrink-0" />
        Données StatsBomb Open Data — <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary transition-colors">statsbomb/open-data</a>
      </div>

      {/* Career summary KPIs */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('statsbomb.career_summary')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label={t('statsbomb.matches')} value={totalMatches} tooltip="Nombre total de matchs dans les données StatsBomb" />
          <StatCard label="Buts" value={totalGoals} accent tooltip="Buts marqués au total" />
          <StatCard label="xG total" value={totalXg.toFixed(1)} tooltip="Expected Goals — qualité des tirs convertis en probabilité de but" />
          <StatCard label="xG/But" value={totalGoals > 0 ? (totalXg / totalGoals).toFixed(2) : '—'} tooltip="Ratio xG par but. Valeur < 1 = efficace au-dessus des attentes" />
        </div>
      </div>

      {/* Season selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={selectedKey || (seasonOptions[0]?.key ?? '')}
          onValueChange={setSelectedKey}
        >
          <SelectTrigger className="rounded-xl w-auto min-w-[260px]">
            <SelectValue placeholder={t('statsbomb.select_season')} />
          </SelectTrigger>
          <SelectContent>
            {seasonOptions.map(o => (
              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected && (
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {selected.matches} {t('statsbomb.matches')}
          </Badge>
        )}
      </div>

      {selected && (
        <>
          {/* Stats grid — season */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Attaque */}
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-rose-500" />
                  {t('statsbomb.attack')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 pt-0">
                <StatCard label="Buts" value={selected.goals} accent tooltip="Buts marqués" />
                <StatCard label="xG" value={selected.xg.toFixed(2)} tooltip="Expected Goals — probabilité totale de buts" />
                <StatCard label="xG/90" value={per90(selected.xg, selected.matches)} tooltip="xG par match" />
                <StatCard label="Tirs" value={selected.shots} tooltip="Tirs tentés au total" />
                <StatCard label="Cadrés" value={selected.shots_on_target} tooltip="Tirs cadrés (sur cible)" />
                <StatCard label="Précision" value={selected.shots > 0 ? `${Math.round((selected.shots_on_target / selected.shots) * 100)}%` : '—'} tooltip="% tirs cadrés / tirs tentés" />
                <StatCard label="Drib. réussis" value={selected.dribbles_completed} tooltip="Dribbles réussis au total" />
                <StatCard label="Drib. tentés" value={selected.dribbles_attempted} tooltip="Dribbles tentés" />
                <StatCard label="% Drib." value={selected.dribbles_attempted > 0 ? `${Math.round((selected.dribbles_completed / selected.dribbles_attempted) * 100)}%` : '—'} tooltip="Taux de réussite des dribbles" />
              </CardContent>
            </Card>

            {/* Passes */}
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sky-500" />
                  {t('statsbomb.passing')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 pt-0">
                <StatCard label="Passes" value={selected.passes} tooltip="Passes tentées" />
                <StatCard label="Réussies" value={selected.passes_completed} tooltip="Passes réussies" />
                <StatCard label="% Pass." value={selected.pass_pct != null ? `${selected.pass_pct}%` : '—'} accent tooltip="Précision des passes" />
                <StatCard label="Passes clés" value={selected.key_passes} tooltip="Passes menant directement à un tir" />
                <StatCard label="Passes prog." value={selected.progressive_passes} tooltip="Passes faisant progresser le ballon vers le but adverse (≥10m)" />
                <StatCard label="Passes/90" value={per90(selected.passes, selected.matches)} tooltip="Passes tentées par match" />
              </CardContent>
            </Card>

            {/* Défense */}
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  {t('statsbomb.defending')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-2 pt-0">
                <StatCard label="Pressions" value={selected.pressures} tooltip="Nombre de fois où le joueur a pressé un adversaire en possession" />
                <StatCard label="Press./90" value={per90(selected.pressures, selected.matches)} tooltip="Pressions par match" />
                <StatCard label="Tacles" value={selected.tackles} tooltip="Tacles tentés" />
                <StatCard label="Intercept." value={selected.interceptions} tooltip="Interceptions" />
                <StatCard label="Duels gagnés" value={selected.duels_won} tooltip="Duels (aériens + terrestres) remportés" />
                <StatCard label="% Duels" value={selected.duels_total > 0 ? `${Math.round((selected.duels_won / selected.duels_total) * 100)}%` : '—'} tooltip="Taux de duels gagnés" />
              </CardContent>
            </Card>

            {/* Radar */}
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Swords className="w-4 h-4 text-violet-500" />
                    {t('statsbomb.radar')}
                  </CardTitle>
                  <div className="flex gap-1">
                    {(['attacking', 'defending'] as Category[]).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setRadarCategory(cat)}
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full transition-colors',
                          radarCategory === cat
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {cat === 'attacking' ? t('statsbomb.attack') : t('statsbomb.defending')}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis
                      dataKey="axis"
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Radar
                      name={player.name}
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
                <p className="text-[9px] text-muted-foreground/50 text-center mt-1">
                  Normalisé /90 min — 100% = max de la catégorie
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Per-match bar chart — goals */}
          {data.stats.length > 1 && (
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t('statsbomb.goals_by_season')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={data.stats} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="season_name" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <Bar dataKey="goals" radius={[3, 3, 0, 0]}>
                      {data.stats.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.competition_id === selected.competition_id && entry.season_id === selected.season_id
                            ? 'hsl(var(--primary))'
                            : 'hsl(var(--muted-foreground)/40)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
