import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Database, Loader2, ChevronRight } from 'lucide-react';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

type WyscoutPlayer = {
  id: string;
  name: string;
  club: string | null;
  position: string | null;
  generation: number | null;
  wyscout_season: string | null;
};

const POSITIONS = ['', 'GK', 'DC', 'LD', 'LG', 'MDef', 'MC', 'MO', 'AD', 'AG', 'ATT'];

function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function WyscoutCatalogSearch() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('wyscout') || '';
  const [q, setQ] = useState(initialQ);
  const [position, setPosition] = useState('');
  const debouncedQ = useDebounce(q);

  // Clear the ?wyscout= param once consumed so the URL stays clean on refresh.
  useEffect(() => {
    if (searchParams.has('wyscout')) {
      const next = new URLSearchParams(searchParams);
      next.delete('wyscout');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = useQuery({
    queryKey: ['wyscout-catalog-search', debouncedQ, position],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedQ) params.set('q', debouncedQ);
      if (position) params.set('position', position);
      params.set('limit', '50');
      const res = await fetch(`${API_BASE}/wyscout/search?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('search failed');
      return res.json() as Promise<{ results: WyscoutPlayer[]; total: number }>;
    },
    enabled: debouncedQ.length > 0 || !!position,
    staleTime: 60 * 1000,
  });

  const results = search.data?.results || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-500" />
          Base de statistiques (partagée)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un joueur ou un club..."
              className="pl-9"
            />
          </div>
          <Select value={position || 'all'} onValueChange={(v) => setPosition(v === 'all' ? '' : v)}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Poste" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les postes</SelectItem>
              {POSITIONS.filter(Boolean).map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {search.isFetching && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" /> Recherche...
          </div>
        )}

        {!search.isFetching && search.data && (
          <div className="text-xs text-muted-foreground">
            {search.data.total} résultat{search.data.total > 1 ? 's' : ''} — {results.length} affiché{results.length > 1 ? 's' : ''}
          </div>
        )}

        {results.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Joueur</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Club</th>
                    <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Poste</th>
                    <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Année</th>
                    <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">Saison</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t hover:bg-muted/30 cursor-pointer"
                      onClick={() => navigate(`/data/player/${p.id}`)}
                    >
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{p.club || '—'}</td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        {p.position && <Badge variant="outline" className="text-[10px]">{p.position}</Badge>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">{p.generation || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground hidden lg:table-cell">{p.wyscout_season || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!search.isFetching && search.data && results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Aucun joueur trouvé. Essaie un autre nom ou un autre club.
          </p>
        )}

        {!debouncedQ && !position && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Recherche un joueur de la base de statistiques (partagée par tous les comptes).
          </p>
        )}
      </CardContent>
    </Card>
  );
}
