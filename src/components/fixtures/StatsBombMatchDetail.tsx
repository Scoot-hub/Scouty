import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ChevronLeft, Zap, Users, Trophy, Target, TrendingUp, Shield, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface SbPerformer {
  player_name: string;
  team_id: number;
  goals: number;
  xg: number;
  shots: number;
  key_passes: number;
  passes: number;
  passes_completed: number;
  dribbles_completed: number;
  pressures: number;
  tackles: number;
  interceptions: number;
}

interface SbLineupRow {
  player_id: number;
  player_name: string;
  team_id: number;
  team_name: string;
  jersey_number: number | null;
  goals: number | null;
  xg: number | null;
  key_passes: number | null;
  passes_completed: number | null;
  passes: number | null;
  tackles: number | null;
  pressures: number | null;
}

interface SbMatchFull {
  match: {
    match_id: number;
    match_date: string;
    home_team: string;
    away_team: string;
    home_team_id: number;
    away_team_id: number;
    home_score: number | null;
    away_score: number | null;
    competition_name: string;
    season_name: string;
    stadium_name: string | null;
    competition_stage: string | null;
    match_week: number | null;
    has_360: boolean;
  };
  performers: SbPerformer[];
  lineups: SbLineupRow[];
}

function useMatchFull(matchId: number) {
  return useQuery<SbMatchFull>({
    queryKey: ['sb-match-full', matchId],
    queryFn: async () => {
      const res = await fetch(`${API}/statsbomb/match/${matchId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Match not found');
      return res.json();
    },
    staleTime: 10 * 60_000,
  });
}

function PlayerRow({ p, isHome }: { p: SbLineupRow; isHome: boolean }) {
  const passPct = p.passes && p.passes > 0 ? Math.round(((p.passes_completed ?? 0) / p.passes) * 100) : null;
  return (
    <div className={cn('flex items-center gap-2 py-1.5 border-b border-border/20 last:border-0 text-xs', !isHome && 'flex-row-reverse')}>
      {p.jersey_number && (
        <span className="w-5 text-center text-[10px] text-muted-foreground font-mono shrink-0">{p.jersey_number}</span>
      )}
      <span className="flex-1 truncate font-medium">{p.player_name}</span>
      <div className={cn('flex items-center gap-2 shrink-0', !isHome && 'flex-row-reverse')}>
        {(p.goals ?? 0) > 0 && (
          <Badge className="text-[9px] h-4 bg-primary/10 text-primary border-primary/20">⚽ {p.goals}</Badge>
        )}
        {p.xg != null && p.xg > 0.1 && (
          <span className="text-[10px] text-muted-foreground">xG {parseFloat(String(p.xg)).toFixed(2)}</span>
        )}
        {passPct != null && (
          <span className="text-[10px] text-muted-foreground hidden sm:inline">{passPct}%</span>
        )}
      </div>
    </div>
  );
}

export default function StatsBombMatchDetail({ matchId }: { matchId: number }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useMatchFull(matchId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
        <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
        <span className="text-sm">Chargement du match StatsBomb...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground">Match StatsBomb introuvable</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Retour
        </Button>
      </div>
    );
  }

  const { match, performers, lineups } = data;
  const homeLineup = lineups.filter(p => p.team_id === match.home_team_id);
  const awayLineup = lineups.filter(p => p.team_id === match.away_team_id);
  const hasScore = match.home_score != null && match.away_score != null;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Back */}
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-1" onClick={() => navigate(-1)}>
        <ChevronLeft className="w-4 h-4" /> Retour
      </Button>

      {/* Header card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-muted/50 to-muted/20 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Zap className="w-3 h-3 text-violet-500" /> StatsBomb
            </Badge>
            <span className="text-xs text-muted-foreground">{match.competition_name} — {match.season_name}</span>
            {match.competition_stage && match.competition_stage !== 'Regular Season' && (
              <Badge variant="secondary" className="text-[10px]">{match.competition_stage}</Badge>
            )}
            {match.match_week && (
              <span className="text-xs text-muted-foreground/60">J{match.match_week}</span>
            )}
            {match.has_360 && (
              <Badge className="text-[10px] bg-violet-500/10 text-violet-600 border-violet-500/20">360°</Badge>
            )}
          </div>

          {/* Score banner */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-right">
              <p className="text-lg font-bold">{match.home_team}</p>
            </div>
            <div className="text-center">
              {hasScore ? (
                <div className="text-3xl font-extrabold tabular-nums">
                  {match.home_score} – {match.away_score}
                </div>
              ) : (
                <span className="text-xl text-muted-foreground">vs</span>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                {new Date(match.match_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex-1 text-left">
              <p className="text-lg font-bold">{match.away_team}</p>
            </div>
          </div>

          {match.stadium_name && (
            <p className="text-[10px] text-muted-foreground/60 text-center mt-3">📍 {match.stadium_name}</p>
          )}
        </div>
      </Card>

      <Tabs defaultValue="performers">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="performers" className="gap-1.5">
            <Star className="w-3.5 h-3.5" /> Meilleures performances
          </TabsTrigger>
          <TabsTrigger value="lineups" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> Compositions
          </TabsTrigger>
        </TabsList>

        {/* Top performers */}
        <TabsContent value="performers" className="mt-4">
          <Card className="card-warm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> Meilleures performances du match
              </CardTitle>
            </CardHeader>
            <CardContent>
              {performers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune donnée de performance</p>
              ) : (
                <div className="space-y-3">
                  {performers.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20">
                      <span className="text-sm font-bold text-muted-foreground/40 w-5 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.player_name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {p.goals > 0 && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">⚽ {p.goals} but{p.goals > 1 ? 's' : ''}</span>}
                          {p.xg > 0 && <span className="text-[10px] text-muted-foreground">xG {parseFloat(String(p.xg)).toFixed(2)}</span>}
                          {p.shots > 0 && <span className="text-[10px] text-muted-foreground">{p.shots} tirs</span>}
                          {p.key_passes > 0 && <span className="text-[10px] text-sky-600">{p.key_passes} passe{p.key_passes > 1 ? 's' : ''} clé</span>}
                          {p.tackles > 0 && <span className="text-[10px] text-emerald-600">{p.tackles} tacle{p.tackles > 1 ? 's' : ''}</span>}
                          {p.pressures > 0 && <span className="text-[10px] text-muted-foreground">{p.pressures} press.</span>}
                          {p.passes > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {Math.round((p.passes_completed / p.passes) * 100)}% passes
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Lineups */}
        <TabsContent value="lineups" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm truncate">{match.home_team}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {homeLineup.map(p => <PlayerRow key={p.player_id} p={p} isHome={true} />)}
              </CardContent>
            </Card>
            <Card className="card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm truncate">{match.away_team}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {awayLineup.map(p => <PlayerRow key={p.player_id} p={p} isHome={false} />)}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-muted-foreground/50 text-center">
        StatsBomb Open Data · <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">github.com/statsbomb/open-data</a>
      </p>
    </div>
  );
}
