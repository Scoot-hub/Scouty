import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, ArrowRight, Loader2 } from 'lucide-react';
import type { Player, Report } from '@/types/player';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface ProfileDataTabProps {
  player: Player;
  allPlayers: Player[];
  reports: Report[];
  perfScores: { physical: number; technical: number; tactical: number; mental: number };
  updatePerfScore: (key: 'physical' | 'technical' | 'tactical' | 'mental', value: number) => void;
  enriching: boolean;
  handleEnrich: (tmUrl?: string) => void;
  isPremium: boolean;
  isAdmin: boolean;
}

export default function ProfileDataTab({ player }: ProfileDataTabProps) {
  const match = useQuery({
    queryKey: ['wyscout-match-from-local', player.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/match-from-local/${player.id}`, { credentials: 'include' });
      if (!res.ok) return { matched: null };
      return res.json() as Promise<{ matched: string | null }>;
    },
    enabled: !!player.id,
    staleTime: 5 * 60 * 1000,
  });

  const targetUrl = match.data?.matched
    ? `/data/player/${match.data.matched}`
    : `/data?wyscout=${encodeURIComponent(player.name || '')}`;

  return (
    <Card>
      <CardContent className="py-10 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Database className="w-6 h-6 text-emerald-500" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Data WyScout</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Toute la data WyScout est centralisée sur la page <strong>Data</strong>.
            {match.isLoading
              ? ' Recherche du joueur dans la base partagée...'
              : match.data?.matched
                ? ' Ce joueur est présent dans la base — clique pour ouvrir sa fiche.'
                : ` Aucune correspondance directe trouvée pour ${player.name || 'ce joueur'} — la recherche sera ouverte sur son nom.`}
          </p>
        </div>
        <Button asChild className="gap-2" disabled={match.isLoading}>
          <Link to={targetUrl}>
            {match.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Voir la data WyScout <ArrowRight className="w-4 h-4" /></>}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
