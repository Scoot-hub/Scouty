import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSavedChampionships, useUnsaveChampionship } from '@/hooks/use-saved-championships';
import { LeagueLogo } from '@/components/ui/league-logo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Trophy, Search, Star, StarOff, ChevronRight, Globe, ArrowRight } from 'lucide-react';

export default function MyChampionships() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: saved = [], isLoading } = useSavedChampionships();
  const unsave = useUnsaveChampionship();
  const [filter, setFilter] = useState('');

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
    <div className="max-w-3xl mx-auto space-y-6">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(champ => (
            <Card
              key={champ.id}
              className="group card-warm overflow-hidden hover:border-primary/30 transition-all hover:shadow-md cursor-pointer"
              onClick={() => navigate(`/championships?search=${encodeURIComponent(champ.championship_name)}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {/* Logo */}
                  <div className="w-11 h-11 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
                    {champ.championship_logo ? (
                      <img
                        src={champ.championship_logo}
                        alt={champ.championship_name}
                        className="w-9 h-9 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <LeagueLogo league={champ.championship_name} size="sm" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">
                      {champ.championship_name}
                    </p>
                    {champ.championship_country && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Globe className="w-3 h-3" />
                        {champ.championship_country}
                      </p>
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
