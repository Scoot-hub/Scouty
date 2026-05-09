import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { usePlayers } from '@/hooks/use-players';
import { useStatsBombPlayer, type SbSeasonStats } from '@/hooks/use-statsbomb';
import { useIsAdmin } from '@/hooks/use-admin';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend,
} from 'recharts';
import { GitCompareArrows, Search, Zap, Target, TrendingUp, Shield, Crown, Lock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { Player } from '@/types/player';
import { Link } from 'react-router-dom';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

const AXES = [
  { key: 'xg',                 label: 'xG',            max: 1.5  },
  { key: 'shots',              label: 'Tirs',           max: 5    },
  { key: 'key_passes',         label: 'Passes clés',    max: 3    },
  { key: 'progressive_passes', label: 'Passes prog.',   max: 6    },
  { key: 'dribbles_completed', label: 'Dribbles',       max: 4    },
  { key: 'pressures',          label: 'Pressions',      max: 20   },
  { key: 'tackles',            label: 'Tacles',         max: 5    },
  { key: 'interceptions',      label: 'Intercept.',     max: 3    },
  { key: 'duels_won',          label: 'Duels gagnés',   max: 8    },
  { key: 'pass_pct',           label: 'Pass %',         max: 100  },
];

const per90 = (val: number, matches: number) =>
  matches > 0 ? val / matches : 0;

function StatRow({
  label, a, b, higherIsBetter = true,
}: { label: string; a: number | string; b: number | string; higherIsBetter?: boolean }) {
  const numA = typeof a === 'string' ? parseFloat(a) : a;
  const numB = typeof b === 'string' ? parseFloat(b) : b;
  const aWins = !isNaN(numA) && !isNaN(numB) && (higherIsBetter ? numA > numB : numA < numB);
  const bWins = !isNaN(numA) && !isNaN(numB) && (higherIsBetter ? numB > numA : numB < numA);
  return (
    <div className="flex items-center text-xs py-1.5 border-b border-border/30 last:border-0">
      <span className={cn('w-14 text-right font-semibold tabular-nums', aWins && 'text-primary')}>{a}</span>
      <span className="flex-1 text-center text-[10px] text-muted-foreground px-2">{label}</span>
      <span className={cn('w-14 text-left font-semibold tabular-nums', bWins && 'text-violet-500')}>{b}</span>
    </div>
  );
}

function PlayerSelector({
  label, color, value, onSelect, players, isLoading: playersLoading,
}: {
  label: string; color: string; value: Player | null;
  onSelect: (p: Player | null) => void; players: Player[]; isLoading?: boolean;
}) {
  const [search, setSearch] = useState('');
  const q = search.toLowerCase();
  const filtered = useMemo(
    () => players.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.club || '').toLowerCase().includes(q) ||
      (p.position || '').toLowerCase().includes(q) ||
      (p.nationality || '').toLowerCase().includes(q)
    ).slice(0, 10),
    [players, q]
  );

  return (
    <Card className="card-warm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={playersLoading ? 'Chargement des joueurs…' : 'Rechercher un joueur…'}
            disabled={playersLoading}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          {playersLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        {search && (
          <div className="rounded-lg border border-border/60 divide-y divide-border/30 overflow-hidden">
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">Aucun joueur trouvé</p>
            ) : filtered.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); setSearch(''); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{p.club} · {p.position}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {value && !search && (
          <div className="flex items-center justify-between rounded-lg bg-muted/30 border border-border/40 px-3 py-2">
            <div>
              <p className="text-xs font-semibold">{value.name}</p>
              <p className="text-[10px] text-muted-foreground">{value.club} · {value.position}</p>
            </div>
            <button onClick={() => onSelect(null)} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">✕</button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SeasonPicker({
  playerName, color, onSelect, selectedKey,
}: {
  playerName: string; color: string; onSelect: (s: SbSeasonStats | null) => void; selectedKey: string;
}) {
  const { data, isLoading } = useStatsBombPlayer(playerName);

  const options = useMemo(() => {
    if (!data?.stats.length) return [];
    return data.stats.map(s => ({
      key: `${s.competition_id}-${s.season_id}`,
      label: `${s.competition_name} — ${s.season_name}`,
      stats: s,
    }));
  }, [data]);

  if (isLoading) return <p className="text-xs text-muted-foreground animate-pulse">Chargement...</p>;
  if (!options.length) return <p className="text-xs text-muted-foreground italic">Pas de données StatsBomb pour ce joueur</p>;

  return (
    <Select
      value={selectedKey || options[0]?.key}
      onValueChange={val => {
        const found = options.find(o => o.key === val);
        onSelect(found?.stats ?? null);
      }}
    >
      <SelectTrigger className="rounded-xl w-full text-xs h-8" style={{ borderColor: `${color}44` }}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const COLOR_A = 'hsl(var(--primary))';
const COLOR_B = '#8b5cf6';

export default function PlayerCompare() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: players = [], isLoading: playersLoading } = usePlayers();
  const { data: isAdmin } = useIsAdmin();

  // ── Premium check ──────────────────────────────────────────────────────────
  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('check-subscription');
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const isPremium = !!(subData?.subscribed) || !!isAdmin;

  const { data: creditsData, refetch: refetchCredits } = useQuery({
    queryKey: ['credits-me'],
    queryFn: async () => {
      const res = await fetch(`${API}/credits/me`, { credentials: 'include' });
      return res.ok ? res.json() : null;
    },
    enabled: isPremium,
    staleTime: 30 * 1000,
  });

  // ── Player & stats state ───────────────────────────────────────────────────
  const [playerA, setPlayerA] = useState<Player | null>(null);
  const [playerB, setPlayerB] = useState<Player | null>(null);
  const [statsA, setStatsA] = useState<SbSeasonStats | null>(null);
  const [statsB, setStatsB] = useState<SbSeasonStats | null>(null);
  const [keyA, setKeyA] = useState('');
  const [keyB, setKeyB] = useState('');

  // ── Credit / unlock state ──────────────────────────────────────────────────
  const [unlockedPairKey, setUnlockedPairKey] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Pair key based on player IDs — changes when players change
  const pairKey = playerA && playerB ? `${playerA.id}|${playerB.id}` : null;
  const comparisonUnlocked = pairKey !== null && pairKey === unlockedPairKey;
  const canCompare = !!(statsA && statsB); // both stats loaded

  // Reset unlock when players change
  useEffect(() => {
    setUnlockedPairKey(null);
  }, [playerA?.id, playerB?.id]);

  const handleUnlock = async () => {
    if (!canCompare) return;
    setUnlocking(true);
    try {
      const res = await fetch(`${API}/statsbomb/compare-credit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          toast({ title: 'Crédits insuffisants', description: `Limite atteinte (${body.used}/${body.quota}). Réessayez demain ou passez à un plan supérieur.`, variant: 'destructive' });
        } else if (res.status === 403) {
          toast({ title: 'Fonctionnalité Premium', description: 'La comparaison de joueurs est réservée aux abonnés Premium.', variant: 'destructive' });
        } else {
          toast({ title: 'Erreur', description: body.error || 'Erreur serveur', variant: 'destructive' });
        }
        return;
      }
      setUnlockedPairKey(pairKey);
      if (!body.free) refetchCredits();
    } finally {
      setUnlocking(false);
    }
  };

  const radarData = useMemo(() => {
    if (!statsA && !statsB) return [];
    return AXES.map(ax => {
      const base: Record<string, number | string> = { axis: ax.label };
      if (statsA) {
        const raw = statsA[ax.key as keyof SbSeasonStats] as number ?? 0;
        base.A = Math.min(100, Math.round(((ax.key === 'pass_pct' ? raw : per90(raw, statsA.matches)) / ax.max) * 100));
      }
      if (statsB) {
        const raw = statsB[ax.key as keyof SbSeasonStats] as number ?? 0;
        base.B = Math.min(100, Math.round(((ax.key === 'pass_pct' ? raw : per90(raw, statsB.matches)) / ax.max) * 100));
      }
      return base;
    });
  }, [statsA, statsB]);

  const fmt = (val: number, decimals = 1) => val.toFixed(decimals);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

  // ── Non-premium gate ───────────────────────────────────────────────────────
  if (subLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
          <Crown className="w-8 h-8 text-amber-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Fonctionnalité Premium</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Le comparateur de joueurs est réservé aux abonnés Premium. Comparez les profils StatsBomb de vos joueurs avec un radar et des statistiques détaillées.
          </p>
        </div>
        <Link to="/pricing">
          <Button className="gap-2">
            <Crown className="w-4 h-4" /> Passer à Premium
          </Button>
        </Link>
        <Link to="/players" className="text-xs text-muted-foreground hover:underline">Retour aux joueurs</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <GitCompareArrows className="w-5 h-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Comparateur de joueurs</h1>
          <p className="text-sm text-muted-foreground">Stats StatsBomb Open Data — normalisées par 90 min</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {creditsData && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Zap className="w-3 h-3 text-amber-500" />
              {creditsData.quotas?.daily === -1 ? '∞' : `${creditsData.usage?.daily ?? 0}/${creditsData.quotas?.daily}`} crédits/jour
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] gap-1">
            <Zap className="w-3 h-3 text-violet-500" /> StatsBomb
          </Badge>
        </div>
      </div>

      {/* Player selectors */}
      <div className="grid grid-cols-2 gap-4">
        <PlayerSelector label="Joueur A" color={COLOR_A} value={playerA} onSelect={p => { setPlayerA(p); setStatsA(null); setKeyA(''); }} players={players} isLoading={playersLoading} />
        <PlayerSelector label="Joueur B" color={COLOR_B} value={playerB} onSelect={p => { setPlayerB(p); setStatsB(null); setKeyB(''); }} players={players} isLoading={playersLoading} />
      </div>

      {/* Season pickers */}
      {(playerA || playerB) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            {playerA && (
              <>
                <p className="text-xs font-medium text-muted-foreground">{playerA.name} — saison</p>
                <SeasonPicker
                  playerName={playerA.name}
                  color={COLOR_A}
                  selectedKey={keyA}
                  onSelect={s => { setStatsA(s); setKeyA(s ? `${s.competition_id}-${s.season_id}` : ''); }}
                />
              </>
            )}
          </div>
          <div className="space-y-1">
            {playerB && (
              <>
                <p className="text-xs font-medium text-muted-foreground">{playerB.name} — saison</p>
                <SeasonPicker
                  playerName={playerB.name}
                  color={COLOR_B}
                  selectedKey={keyB}
                  onSelect={s => { setStatsB(s); setKeyB(s ? `${s.competition_id}-${s.season_id}` : ''); }}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Launch button — shown when both stats are loaded but comparison not yet unlocked */}
      {canCompare && !comparisonUnlocked && (
        <Card className="card-warm border-violet-200 dark:border-violet-800/40 bg-violet-50/50 dark:bg-violet-950/10">
          <CardContent className="py-6 flex flex-col items-center gap-3 text-center">
            <Lock className="w-8 h-8 text-violet-400" />
            <div>
              <p className="text-sm font-semibold">Données chargées — prêt à comparer</p>
              <p className="text-xs text-muted-foreground mt-0.5">Lancer la comparaison consomme 1 crédit</p>
            </div>
            <Button onClick={handleUnlock} disabled={unlocking} className="gap-2 bg-violet-600 hover:bg-violet-700 text-white">
              {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitCompareArrows className="w-4 h-4" />}
              {unlocking ? 'Chargement…' : 'Lancer la comparaison (1 crédit)'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Main comparison — only shown after unlock */}
      {comparisonUnlocked && (statsA || statsB) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Radar chart */}
          <Card className="card-warm">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Radar comparatif</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                  {statsA && (
                    <Radar name={playerA?.name ?? 'A'} dataKey="A"
                      stroke={COLOR_A} fill={COLOR_A} fillOpacity={0.2} strokeWidth={2} />
                  )}
                  {statsB && (
                    <Radar name={playerB?.name ?? 'B'} dataKey="B"
                      stroke={COLOR_B} fill={COLOR_B} fillOpacity={0.2} strokeWidth={2} />
                  )}
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
              <p className="text-[9px] text-muted-foreground/50 text-center">
                100% = max de référence de la catégorie (normalisé /90 min)
              </p>
            </CardContent>
          </Card>

          {/* Stats detail table */}
          <Card className="card-warm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Statistiques détaillées</CardTitle>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" />{playerA?.name ?? 'A'}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />{playerB?.name ?? 'B'}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
                  <Target className="w-3 h-3 text-rose-500" /> Attaque
                </p>
                <StatRow label="Matchs" a={statsA?.matches ?? '—'} b={statsB?.matches ?? '—'} />
                <StatRow label="Buts" a={statsA?.goals ?? '—'} b={statsB?.goals ?? '—'} />
                <StatRow label="xG total" a={statsA ? fmt(statsA.xg, 2) : '—'} b={statsB ? fmt(statsB.xg, 2) : '—'} />
                <StatRow label="xG/match" a={statsA ? fmt(per90(statsA.xg, statsA.matches), 2) : '—'} b={statsB ? fmt(per90(statsB.xg, statsB.matches), 2) : '—'} />
                <StatRow label="Tirs/match" a={statsA ? fmt(per90(statsA.shots, statsA.matches)) : '—'} b={statsB ? fmt(per90(statsB.shots, statsB.matches)) : '—'} />
                <StatRow label="% Tirs cadrés" a={statsA ? pct(statsA.shots_on_target, statsA.shots) : '—'} b={statsB ? pct(statsB.shots_on_target, statsB.shots) : '—'} />
                <StatRow label="Dribbles réussis" a={statsA?.dribbles_completed ?? '—'} b={statsB?.dribbles_completed ?? '—'} />
                <StatRow label="% Dribbles" a={statsA ? pct(statsA.dribbles_completed, statsA.dribbles_attempted) : '—'} b={statsB ? pct(statsB.dribbles_completed, statsB.dribbles_attempted) : '—'} />
              </div>

              <div className="mb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
                  <TrendingUp className="w-3 h-3 text-sky-500" /> Passes
                </p>
                <StatRow label="Passes/match" a={statsA ? fmt(per90(statsA.passes, statsA.matches)) : '—'} b={statsB ? fmt(per90(statsB.passes, statsB.matches)) : '—'} />
                <StatRow label="% Passes" a={statsA?.pass_pct != null ? `${statsA.pass_pct}%` : '—'} b={statsB?.pass_pct != null ? `${statsB.pass_pct}%` : '—'} />
                <StatRow label="Passes clés" a={statsA?.key_passes ?? '—'} b={statsB?.key_passes ?? '—'} />
                <StatRow label="Passes prog." a={statsA?.progressive_passes ?? '—'} b={statsB?.progressive_passes ?? '—'} />
              </div>

              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
                  <Shield className="w-3 h-3 text-emerald-500" /> Défense
                </p>
                <StatRow label="Pressions/match" a={statsA ? fmt(per90(statsA.pressures, statsA.matches)) : '—'} b={statsB ? fmt(per90(statsB.pressures, statsB.matches)) : '—'} />
                <StatRow label="Tacles" a={statsA?.tackles ?? '—'} b={statsB?.tackles ?? '—'} />
                <StatRow label="Interceptions" a={statsA?.interceptions ?? '—'} b={statsB?.interceptions ?? '—'} />
                <StatRow label="% Duels" a={statsA ? pct(statsA.duels_won, statsA.duels_total) : '—'} b={statsB ? pct(statsB.duels_won, statsB.duels_total) : '—'} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Waiting for season selection */}
      {!canCompare && playerA && playerB && !comparisonUnlocked && (
        <Card className="card-warm">
          <CardContent className="py-12 text-center">
            <GitCompareArrows className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">Sélectionnez une saison pour chaque joueur pour lancer la comparaison</p>
          </CardContent>
        </Card>
      )}

      {!playerA && !playerB && (
        <Card className="card-warm">
          <CardContent className="py-16 text-center">
            <GitCompareArrows className="w-12 h-12 mx-auto mb-4 text-muted-foreground/15" />
            <p className="text-sm font-medium text-muted-foreground">Sélectionnez deux joueurs pour comparer leurs statistiques StatsBomb</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Les données couvrent La Liga, Champions League, Coupes du Monde et plus</p>
          </CardContent>
        </Card>
      )}

      <p className="text-[10px] text-muted-foreground/50 text-center">
        Données StatsBomb Open Data · <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">github.com/statsbomb/open-data</a>
      </p>
    </div>
  );
}
