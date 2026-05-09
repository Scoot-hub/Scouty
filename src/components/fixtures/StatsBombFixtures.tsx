import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, Trophy, ChevronRight, Database, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface SbCompetition {
  competition_id: number;
  season_id: number;
  competition_name: string;
  season_name: string;
  country_name: string | null;
  competition_gender: string;
}

interface SbMatch {
  match_id: number;
  match_date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  competition_name: string;
  season_name: string;
  competition_stage: string | null;
  match_week: number | null;
  has_360: boolean;
}

function useCompetitions() {
  return useQuery<{ competitions: SbCompetition[] }>({
    queryKey: ['sb-competitions'],
    queryFn: async () => {
      const res = await fetch(`${API}/statsbomb/competitions`, { credentials: 'include' });
      if (!res.ok) return { competitions: [] };
      return res.json();
    },
    staleTime: 30 * 60_000,
  });
}

function useMatches(competitionId: number | null, seasonId: number | null, search: string) {
  return useQuery<{ matches: SbMatch[]; total: number }>({
    queryKey: ['sb-matches', competitionId, seasonId, search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (competitionId) params.set('competition_id', String(competitionId));
      if (seasonId) params.set('season_id', String(seasonId));
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`${API}/statsbomb/matches?${params}`, { credentials: 'include' });
      if (!res.ok) return { matches: [], total: 0 };
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

function MatchCard({ match }: { match: SbMatch }) {
  const navigate = useNavigate();
  const hasScore = match.home_score !== null && match.away_score !== null;

  return (
    <Card
      className="group hover:border-primary/30 transition-all cursor-pointer hover:shadow-sm"
      onClick={() => navigate(`/match/sb-${match.match_id}`)}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2 justify-between">
          {/* Teams & score */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold truncate flex-1">{match.home_team}</span>
              {hasScore ? (
                <span className="text-sm font-extrabold tabular-nums text-primary shrink-0 mx-1">
                  {match.home_score} – {match.away_score}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground shrink-0 mx-1">vs</span>
              )}
              <span className="text-xs font-semibold truncate flex-1 text-right">{match.away_team}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">
                {new Date(match.match_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              {match.competition_stage && match.competition_stage !== 'Regular Season' && (
                <Badge variant="outline" className="text-[9px] h-3.5 px-1">{match.competition_stage}</Badge>
              )}
              {match.match_week && (
                <span className="text-[10px] text-muted-foreground/60">J{match.match_week}</span>
              )}
              {match.has_360 && (
                <Badge className="text-[9px] h-3.5 px-1 bg-violet-500/10 text-violet-600 border-violet-500/20">360°</Badge>
              )}
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary shrink-0 transition-colors" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatsBombFixtures() {
  const [search, setSearch] = useState('');
  const [selectedCompKey, setSelectedCompKey] = useState<string>('');

  const { data: compsData, isLoading: compsLoading } = useCompetitions();

  const competitions = compsData?.competitions ?? [];

  // Group competitions by name for the selector
  const competitionNames = useMemo(() => {
    const map = new Map<string, SbCompetition[]>();
    for (const c of competitions) {
      const arr = map.get(c.competition_name) || [];
      arr.push(c);
      map.set(c.competition_name, arr);
    }
    return map;
  }, [competitions]);

  const allOptions = useMemo(() => {
    const opts: { key: string; label: string; cid: number; sid: number }[] = [];
    for (const [compName, seasons] of competitionNames) {
      for (const s of seasons) {
        opts.push({
          key: `${s.competition_id}-${s.season_id}`,
          label: `${compName} — ${s.season_name}${s.competition_gender === 'female' ? ' ♀' : ''}`,
          cid: s.competition_id,
          sid: s.season_id,
        });
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [competitionNames]);

  const selected = allOptions.find(o => o.key === selectedCompKey);
  const { data, isLoading } = useMatches(selected?.cid ?? null, selected?.sid ?? null, search);

  if (compsLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Chargement des compétitions StatsBomb...</span>
      </div>
    );
  }

  if (!competitions.length) {
    return (
      <Card className="card-warm">
        <CardContent className="py-16 text-center">
          <Database className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm font-medium text-muted-foreground">Base StatsBomb non encore importée</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Lance l'import depuis l'administration : <code className="text-[10px] bg-muted px-1 rounded">POST /api/admin/statsbomb/import</code></p>
        </CardContent>
      </Card>
    );
  }

  const matches = data?.matches ?? [];
  const total = data?.total ?? 0;

  // Group by date
  const byDate = useMemo(() => {
    const map = new Map<string, SbMatch[]>();
    for (const m of matches) {
      const d = m.match_date.slice(0, 10);
      const arr = map.get(d) || [];
      arr.push(m);
      map.set(d, arr);
    }
    return map;
  }, [matches]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedCompKey} onValueChange={setSelectedCompKey}>
          <SelectTrigger className="rounded-xl w-auto min-w-[280px]">
            <SelectValue placeholder="Toutes les compétitions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Toutes les compétitions</SelectItem>
            {allOptions.map(o => (
              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher une équipe..."
            className="pl-8 rounded-xl"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
          <Zap className="w-3.5 h-3.5 text-violet-500" />
          <span>{total} matchs disponibles</span>
        </div>
      </div>

      {/* Matches */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Chargement...</span>
        </div>
      ) : matches.length === 0 ? (
        <Card className="card-warm">
          <CardContent className="py-12 text-center">
            <Trophy className="w-8 h-8 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {search || selectedCompKey ? 'Aucun match trouvé pour cette recherche' : 'Sélectionnez une compétition'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {Array.from(byDate.entries()).map(([date, dayMatches]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                <span className="ml-2 font-normal text-muted-foreground/60">{dayMatches.length} match{dayMatches.length > 1 ? 's' : ''}</span>
              </p>
              <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {dayMatches.map(m => <MatchCard key={m.match_id} match={m} />)}
              </div>
            </div>
          ))}

          {total > 50 && (
            <p className="text-center text-xs text-muted-foreground/60">
              Affichage des 50 premiers matchs sur {total}. Affinez votre recherche pour voir plus.
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/50 text-center">
        StatsBomb Open Data · <a href="https://github.com/statsbomb/open-data" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">github.com/statsbomb/open-data</a>
      </p>
    </div>
  );
}
