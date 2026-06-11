import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Bookmark, ChevronRight, Trash2, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { LeagueLogo } from '@/components/ui/league-logo';

function getAuthHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('scouthub_session');
    if (!raw) return {};
    const s = JSON.parse(raw);
    const token = s?.access_token ?? s?.token ?? s?.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch { return {}; }
}

interface SavedMatchSummary {
  id: string;
  livescore_match_id: string | null;
  home_team: string;
  away_team: string;
  home_badge: string | null;
  away_badge: string | null;
  score_home: number | null;
  score_away: number | null;
  competition: string | null;
  match_date: string | null;
  status: string | null;
  saved_at: string;
}

function TeamBadge({ badge, name }: { badge: string | null; name: string }) {
  if (badge) return <img src={badge} alt="" className="w-7 h-7 object-contain" />;
  return (
    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-black text-muted-foreground">
      {name.slice(0, 1)}
    </div>
  );
}

export default function MatchLibrary() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['saved-matches'],
    queryFn: () => fetch('/api/saved-matches', { headers: getAuthHeaders() }).then(r => r.json()),
    staleTime: 0,
  });

  const { mutate: deleteMatch } = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/saved-matches/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-matches'] });
      toast.success('Match supprimé de la bibliothèque');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const matches: SavedMatchSummary[] = data?.matches ?? [];

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <Bookmark className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Ma bibliothèque de matchs</h1>
          <p className="text-sm text-muted-foreground">
            {matches.length} match{matches.length !== 1 ? 's' : ''} enregistré{matches.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : matches.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Bookmark className="w-10 h-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">Aucun match enregistré</p>
            <p className="text-sm text-muted-foreground/70">
              Sur la page d'un match, cliquez sur "Enregistrer" pour l'ajouter à votre bibliothèque.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/fixtures">Parcourir les matchs</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {matches.map(m => (
            <Card key={m.id} className="hover:bg-muted/30 transition-colors">
              <CardContent className="py-3 px-4 flex items-center gap-3">
                {/* Competition logo */}
                {m.competition && (
                  <LeagueLogo league={m.competition} size="sm" className="shrink-0" />
                )}

                {/* Teams + score */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <TeamBadge badge={m.home_badge} name={m.home_team} />
                    <span className="font-semibold text-sm truncate">{m.home_team}</span>
                    {m.score_home != null && m.score_away != null && (
                      <span className="text-sm font-mono font-bold shrink-0 px-1">
                        {m.score_home} – {m.score_away}
                      </span>
                    )}
                    <span className="font-semibold text-sm truncate">{m.away_team}</span>
                    <TeamBadge badge={m.away_badge} name={m.away_team} />
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {m.competition && <span>{m.competition}</span>}
                    {m.match_date && (
                      <>
                        {m.competition && <span>·</span>}
                        <CalendarDays className="w-3 h-3" />
                        <span>{new Date(m.match_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 text-muted-foreground hover:text-destructive"
                    onClick={e => { e.preventDefault(); if (confirm('Supprimer ce match de votre bibliothèque ?')) deleteMatch(m.id); }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button asChild variant="ghost" size="icon" className="w-8 h-8">
                    <Link to={`/saved-match/${m.id}`}>
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
