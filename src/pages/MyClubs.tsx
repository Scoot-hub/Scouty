import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFollowedClubs, useFollowClub, useUnfollowClub } from '@/hooks/use-followed-clubs';
import { usePlayers } from '@/hooks/use-players';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClubBadge } from '@/components/ui/club-badge';
import { toast } from 'sonner';
import { Heart, HeartOff, Plus, Search, Building2, Users, ExternalLink, Trash2 } from 'lucide-react';

export default function MyClubs() {
  const { t } = useTranslation();
  const { data: followedClubs = [], isLoading } = useFollowedClubs();
  const { data: players = [] } = usePlayers();
  const followClub = useFollowClub();
  const unfollowClub = useUnfollowClub();
  const [newClub, setNewClub] = useState('');
  const [search, setSearch] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClub.trim()) return;
    followClub.mutate({ club_name: newClub.trim() }, {
      onSuccess: () => { setNewClub(''); toast.success(t('my_clubs.added', { club: newClub.trim() })); },
      onError: () => toast.error(t('common.error')),
    });
  };

  const filtered = followedClubs.filter(c =>
    c.club_name.toLowerCase().includes(search.toLowerCase())
  );

  // Count scouted players per club
  const playerCountByClub = (club: string) =>
    players.filter(p => p.club && p.club.toLowerCase() === club.toLowerCase()).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Heart className="w-6 h-6 text-primary" />
          {t('my_clubs.title')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('my_clubs.subtitle')}</p>
      </div>

      {/* Add club form */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleAdd} className="flex gap-2">
            <div className="flex-1 relative">
              <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={newClub}
                onChange={e => setNewClub(e.target.value)}
                placeholder={t('my_clubs.add_placeholder')}
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={followClub.isPending || !newClub.trim()}>
              <Heart className="w-4 h-4 mr-2" />
              {t('my_clubs.add_btn')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Search */}
      {followedClubs.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('my_clubs.search')}
            className="pl-10"
          />
        </div>
      )}

      {/* Club list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('my_clubs.empty')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('my_clubs.empty_desc')}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map(club => {
            const count = playerCountByClub(club.club_name);
            return (
              <Card key={club.id} className="hover:border-primary/30 transition-colors group">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Link to={`/club?club=${encodeURIComponent(club.club_name)}`} className="shrink-0">
                      <ClubBadge club={club.club_name} size="md" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/club?club=${encodeURIComponent(club.club_name)}`}
                        className="text-sm font-bold hover:text-primary hover:underline transition-colors truncate block"
                      >
                        {club.club_name}
                      </Link>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {count > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {count} {t('my_clubs.players_scouted')}
                          </span>
                        )}
                        <span>{new Date(club.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Link to={`/club?club=${encodeURIComponent(club.club_name)}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => unfollowClub.mutate(club.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
