import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer as RC2,
} from 'recharts';
import { Zap, Target, TrendingUp, Shield, Crown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface SeasonStats {
  competition_name: string;
  season_name: string;
  competition_id: number;
  season_id: number;
  matches: number;
  goals: number;
  xg_total: number;
  xg_per_game: number;
  shots_per_game: number;
  pass_pct: number;
  passes_per_game: number;
  prog_passes_per_game: number;
  pressures_per_game: number;
  dribbles_per_game: number;
  duel_win_pct: number;
}

interface TopScorer {
  player_name: string;
  goals: number;
  xg: number;
  matches: number;
}

function useTeamAnalysis(teamName: string) {
  return useQuery<{ teams: { team_id: number; team_name: string }[]; selected: { team_id: number; team_name: string } | null; stats: SeasonStats[]; topScorers: TopScorer[] }>({
    queryKey: ['sb-team-analysis', teamName],
    queryFn: async () => {
      if (!teamName.trim()) return { teams: [], selected: null, stats: [], topScorers: [] };
      const res = await fetch(`${API}/statsbomb/team-analysis?team=${encodeURIComponent(teamName)}`, { credentials: 'include' });
      if (!res.ok) return { teams: [], selected: null, stats: [], topScorers: [] };
      return res.json();
    },
    enabled: !!teamName.trim(),
    staleTime: 10 * 60_000,
  });
}

function KpiCard({ label, value, sub, accent, tooltip }: { label: string; value: string | number; sub?: string; accent?: boolean; tooltip?: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('p-3 rounded-xl border text-center', accent ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border/40')}>
            <p className={cn('text-xl font-extrabold tabular-nums', accent && 'text-primary')}>{value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
            {sub && <p className="text-[9px] text-muted-foreground/60">{sub}</p>}
          </div>
        </TooltipTrigger>
        {tooltip && <TooltipContent className="text-xs max-w-xs">{tooltip}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}

const RADAR_AXES = [
  { key: 'xg_per_game',          label: 'xG/match',      max: 2   },
  { key: 'shots_per_game',        label: 'Tirs/match',    max: 15  },
  { key: 'pass_pct',              label: 'Pass %',        max: 90  },
  { key: 'pressures_per_game',    label: 'Pressing',      max: 150 },
  { key: 'prog_passes_per_game',  label: 'Passes prog.',  max: 30  },
  { key: 'duel_win_pct',          label: '% Duels',       max: 60  },
];

export default function StatsBombTacticsTab({ clubName }: { clubName: string }) {
  const { data, isLoading } = useTeamAnalysis(clubName);
  const [selectedKey, setSelectedKey] = useState('');

  const seasonOptions = useMemo(() =>
    (data?.stats ?? []).map(s => ({
      key: `${s.competition_id}-${s.season_id}`,
      label: `${s.competition_name} — ${s.season_name}`,
      stats: s,
    })), [data]);

  const selected: SeasonStats | undefined = useMemo(() => {
    const found = seasonOptions.find(o => o.key === selectedKey);
    return (found ?? seasonOptions[0])?.stats;
  }, [seasonOptions, selectedKey]);

  const radarData = useMemo(() => {
    if (!selected) return [];
    return RADAR_AXES.map(ax => ({
      axis: ax.label,
      value: Math.min(100, Math.round(((selected[ax.key as keyof SeasonStats] as number) / ax.max) * 100)),
    }));
  }, [selected]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
      <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
      Chargement analyse StatsBomb...
    </div>;
  }

  if (!data?.stats?.length) return null;

  return (
    <Card className="card-warm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-violet-500" />
          Analyse tactique
          <Badge variant="outline" className="text-[9px] ml-1 border-violet-500/30 text-violet-600">StatsBomb</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
        <Info className="w-3 h-3 shrink-0" />
        {'Données StatsBomb Open Data — analyse collective basée sur'} {data.stats.reduce((s, r) => s + r.matches, 0)} matchs
      </div>

      {/* Season selector */}
      <Select value={selectedKey || (seasonOptions[0]?.key ?? '')} onValueChange={setSelectedKey}>
        <SelectTrigger className="rounded-xl w-auto min-w-[250px]">
          <SelectValue placeholder="Sélectionner une saison..." />
        </SelectTrigger>
        <SelectContent>
          {seasonOptions.map(o => (
            <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selected && (
        <>
          {/* KPIs grid */}
          <div className="grid grid-cols-4 gap-3">
            <KpiCard label="Matchs" value={selected.matches} />
            <KpiCard label="Buts/match" value={(selected.goals / selected.matches).toFixed(2)} accent tooltip="Moyenne de buts marqués par match" />
            <KpiCard label="xG/match" value={selected.xg_per_game.toFixed(2)} tooltip="Expected Goals par match — qualité de création" />
            <KpiCard label="Tirs/match" value={selected.shots_per_game} tooltip="Nombre de tirs par match" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Radar tactique */}
            <Card className="card-warm">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-violet-500" /> Profil tactique
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={200}>
                  <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                    <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Stats details */}
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Statistiques détaillées</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {[
                  { label: '% Passes réussies', value: `${selected.pass_pct ?? '—'}%`, icon: TrendingUp, color: 'text-sky-500' },
                  { label: 'Passes/match', value: selected.passes_per_game, icon: TrendingUp, color: 'text-sky-400' },
                  { label: 'Passes progressives/match', value: selected.prog_passes_per_game, icon: TrendingUp, color: 'text-sky-300' },
                  { label: 'Pressions/match', value: selected.pressures_per_game, icon: Shield, color: 'text-emerald-500' },
                  { label: 'Dribbles/match', value: selected.dribbles_per_game, icon: Target, color: 'text-rose-500' },
                  { label: '% Duels gagnés', value: `${selected.duel_win_pct ?? '—'}%`, icon: Shield, color: 'text-amber-500' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex items-center justify-between text-xs py-1 border-b border-border/20 last:border-0">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Icon className={cn('w-3 h-3', color)} />{label}
                    </span>
                    <span className="font-semibold tabular-nums">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Top scorers */}
          {(data.topScorers?.length ?? 0) > 0 && (
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" /> Top buteurs (toutes saisons)
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {data.topScorers.slice(0, 8).map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-5 text-center text-[10px] text-muted-foreground/50 shrink-0">{i + 1}</span>
                      <span className="flex-1 truncate font-medium">{s.player_name}</span>
                      <Badge className="text-[9px] h-4 bg-primary/10 text-primary border-primary/20 shrink-0">
                        {s.goals}G
                      </Badge>
                      <span className="text-[10px] text-muted-foreground/70 shrink-0">xG {s.xg}</span>
                      <span className="text-[10px] text-muted-foreground/50 shrink-0">{s.matches}m</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Goals trend */}
          {seasonOptions.length > 1 && (
            <Card className="card-warm">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">Buts marqués par saison</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={seasonOptions.map(o => ({ name: (o.stats.season_name ?? '').slice(0, 7), goals: o.stats.goals ?? 0, xg: o.stats.xg_total ?? 0 }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                    <Bar dataKey="goals" radius={[2, 2, 0, 0]}>
                      {seasonOptions.map((o, i) => (
                        <Cell key={i} fill={o.key === (selectedKey || seasonOptions[0]?.key) ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground)/40)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground/50 text-center">
        {'StatsBomb Open Data · '}<a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">github.com/statsbomb/open-data</a>
      </p>
    </div>
      </CardContent>
    </Card>
  );
}
