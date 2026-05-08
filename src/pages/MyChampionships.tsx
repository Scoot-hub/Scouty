import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSavedChampionships, useUnsaveChampionship } from '@/hooks/use-saved-championships';
import { usePlayers } from '@/hooks/use-players';
import { LeagueLogo } from '@/components/ui/league-logo';
import { FlagIcon } from '@/components/ui/flag-icon';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { getLeagueLogoUrl } from '@/data/sofascore-ids';
import { Trophy, Search, Star, StarOff, ChevronRight, ArrowRight, Users, Building2, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';

// Même logique que Championships.tsx
const getEffectiveLeague = (p: Player): string =>
  (((p as any).external_data?.enriched_league ?? p.league) ?? '').trim();
const getEffectiveClub = (p: Player): string =>
  (((p as any).external_data?.enriched_club ?? p.club) ?? '').trim();

export default function MyChampionships() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: saved = [], isLoading } = useSavedChampionships();
  const { data: players = [] } = usePlayers();
  const unsave = useUnsaveChampionship();
  const [filter, setFilter] = useState('');

  // Calcul mécanique des stats pour chaque championnat sauvegardé
  const stats = useMemo(() => {
    const map: Record<string, { playerCount: number; clubCount: number; topClub: string | null }> = {};
    for (const champ of saved) {
      const champLower = champ.championship_name.toLowerCase();
      const matching = players.filter(p => getEffectiveLeague(p).toLowerCase() === champLower);
      const clubFreq: Record<string, number> = {};
      for (const p of matching) {
        const club = getEffectiveClub(p);
        if (club) clubFreq[club] = (clubFreq[club] ?? 0) + 1;
      }
      const clubs = Object.keys(clubFreq);
      const topClub = clubs.sort((a, b) => clubFreq[b] - clubFreq[a])[0] ?? null;
      map[champ.championship_name] = {
        playerCount: matching.length,
        clubCount: clubs.length,
        topClub,
      };
    }
    return map;
  }, [saved, players]);

  const filtered = filter.trim()
    ? saved.filter(s =>
        s.championship_name.toLowerCase().includes(filter.toLowerCase()) ||
        (s.championship_country || '').toLowerCase().includes(filter.toLowerCase())
      )
    : saved;

  const handleUnsave = (name: string) => {
    unsave.mutate(name, {
      onSuccess: () => toast.success(t('championships.unsaved', { name })),
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/15 flex items-center justify-center">
            <Star className="w-5 h-5 text-yellow-500" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('my_championships.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('my_championships.subtitle')}</p>
          </div>
        </div>
        <Button variant="outline" className="rounded-xl gap-2" onClick={() => navigate('/championships')}>
          <Trophy className="w-4 h-4" />
          {t('my_championships.browse')}
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Filter */}
      {saved.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder={t('my_championships.filter_placeholder')}
            className="pl-9 rounded-xl"
          />
        </div>
      )}

      {/* Count */}
      {saved.length > 0 && (
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          <span className="text-sm font-semibold">{t('my_championships.followed_title')}</span>
          <Badge variant="secondary" className="tabular-nums">{saved.length}</Badge>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-20 text-center">
            <Trophy className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
            <p className="text-sm font-medium text-muted-foreground mb-1">
              {filter ? t('my_championships.no_match') : t('my_championships.empty')}
            </p>
            {!filter && (
              <>
                <p className="text-xs text-muted-foreground/60 mt-1 mb-4">{t('my_championships.empty_hint')}</p>
                <Button size="sm" variant="outline" className="rounded-xl gap-2" onClick={() => navigate('/championships')}>
                  <Trophy className="w-4 h-4" />
                  {t('my_championships.browse')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(champ => {
            const s = stats[champ.championship_name] ?? { playerCount: 0, clubCount: 0, topClub: null };
            // Même source d'image que la page championnat standard
            const logoUrl = getLeagueLogoUrl(champ.championship_name);

            return (
              <Card
                key={champ.id}
                className="group overflow-hidden hover:border-primary/30 transition-all hover:shadow-lg cursor-pointer"
                onClick={() => navigate(`/championships?search=${encodeURIComponent(champ.championship_name)}`)}
              >
                <CardContent className="p-0">
                  {/* Header */}
                  <div className="flex items-center gap-3 p-4 pb-3">
                    {/* Logo — même rendu que dans la liste des championnats */}
                    <div className="w-12 h-12 rounded-xl bg-muted/30 border border-border/40 flex items-center justify-center shrink-0 overflow-hidden">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={champ.championship_name}
                          className="w-10 h-10 object-contain"
                          loading="lazy"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div style={logoUrl ? { display: 'none' } : {}} className="flex items-center justify-center w-full h-full">
                        <LeagueLogo league={champ.championship_name} size="md" />
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-tight truncate group-hover:text-primary transition-colors">
                        {champ.championship_name}
                      </p>
                      {champ.championship_country && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <FlagIcon nationality={champ.championship_country} size="sm" />
                          <span className="text-xs text-muted-foreground">{champ.championship_country}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); handleUnsave(champ.championship_name); }}
                        title={t('my_championships.unfollow')}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <StarOff className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </div>
                  </div>

                  {/* Stats calculées mécaniquement */}
                  <div className="grid grid-cols-3 divide-x divide-border/40 border-t border-border/40">
                    <div className="flex flex-col items-center justify-center py-2.5 px-2 gap-0.5">
                      <p className="text-base font-extrabold leading-none tabular-nums text-primary">
                        {s.playerCount}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Users className="w-3 h-3 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">{t('my_championships.stat_players')}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center py-2.5 px-2 gap-0.5">
                      <p className="text-base font-extrabold leading-none tabular-nums text-sky-500">
                        {s.clubCount}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">{t('my_championships.stat_clubs')}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center py-2.5 px-2 gap-0.5 min-w-0">
                      <p className={cn('text-xs font-bold leading-tight truncate max-w-full text-center', !s.topClub && 'text-muted-foreground/30')}>
                        {s.topClub ?? '—'}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Crown className="w-3 h-3 text-yellow-500" />
                        <p className="text-[10px] text-muted-foreground">{t('my_championships.stat_top_club')}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
