import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayers } from '@/hooks/use-players';
import { getPlayerAge, resolveLeagueName, type Player, type Opinion, type Position } from '@/types/player';
import { usePositions } from '@/hooks/use-positions';
import { FlagIcon } from '@/components/ui/flag-icon';
import { OpinionBadge } from '@/components/ui/opinion-badge';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ClubBadge } from '@/components/ui/club-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy, Target, Calendar, MessageSquare, TrendingUp, FileText, ArrowDownAZ } from 'lucide-react';

type Dimension = 'league' | 'position' | 'age' | 'opinion' | 'potential' | 'contract';

export default function Tri() {
  const [dimension, setDimension] = useState<Dimension>('league');
  const { data: players = [], isLoading } = usePlayers();
  const { t } = useTranslation();
  const { positions: posLabels, positionShort: posShort } = usePositions();

  const DIMENSIONS: { value: Dimension; label: string; icon: React.ReactNode }[] = [
    { value: 'league', label: t('tri.leagues'), icon: <Trophy className="w-4 h-4" /> },
    { value: 'position', label: t('tri.positions'), icon: <Target className="w-4 h-4" /> },
    { value: 'age', label: t('tri.ages'), icon: <Calendar className="w-4 h-4" /> },
    { value: 'opinion', label: t('tri.opinions'), icon: <MessageSquare className="w-4 h-4" /> },
    { value: 'potential', label: t('tri.potential'), icon: <TrendingUp className="w-4 h-4" /> },
    { value: 'contract', label: t('tri.contracts'), icon: <FileText className="w-4 h-4" /> },
  ];

  function groupPlayers(players: Player[], dimension: Dimension): Record<string, Player[]> {
    const groups: Record<string, Player[]> = {};
    for (const p of players) {
      let key: string;
      switch (dimension) {
        case 'league': key = resolveLeagueName(p.club, p.league) || t('tri.no_league'); break;
        case 'position': key = posLabels[p.position] || p.position; break;
        case 'age': {
          const age = getPlayerAge(p.generation, p.date_of_birth);
          if (age <= 18) key = t('tri.age_u18');
          else if (age <= 20) key = t('tri.age_19_20');
          else if (age <= 23) key = t('tri.age_21_23');
          else if (age <= 26) key = t('tri.age_24_26');
          else if (age <= 30) key = t('tri.age_27_30');
          else key = t('tri.age_31');
          break;
        }
        case 'opinion': key = p.general_opinion; break;
        case 'potential':
          if (p.potential >= 9) key = '⭐ Exceptionnel (9-10)';
          else if (p.potential >= 8) key = '🔥 Très élevé (8-8.5)';
          else if (p.potential >= 7) key = '📈 Élevé (7-7.5)';
          else if (p.potential >= 6) key = '👍 Correct (6-6.5)';
          else key = '📉 Faible (< 6)';
          break;
        case 'contract': {
          if (!p.contract_end) { key = t('tri.contract_none'); }
          else {
            const months = Math.floor((new Date(p.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
            if (months < 0) key = t('tri.contract_expired');
            else if (months <= 6) key = t('tri.contract_6m');
            else if (months <= 12) key = t('tri.contract_12m');
            else if (months <= 24) key = t('tri.contract_2y');
            else key = t('tri.contract_2y_plus');
          }
          break;
        }
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }
    return groups;
  }

  function sortGroupKeys(keys: string[], dimension: Dimension): string[] {
    if (dimension === 'age') {
      const order = [t('tri.age_u18'), t('tri.age_19_20'), t('tri.age_21_23'), t('tri.age_24_26'), t('tri.age_27_30'), t('tri.age_31')];
      return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    if (dimension === 'potential') return keys.sort().reverse();
    if (dimension === 'contract') {
      const order = [t('tri.contract_expired'), t('tri.contract_6m'), t('tri.contract_12m'), t('tri.contract_2y'), t('tri.contract_2y_plus'), t('tri.contract_none')];
      return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    if (dimension === 'opinion') {
      const order = ['À suivre', 'À revoir', 'Défavorable'];
      return keys.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    return keys.sort((a, b) => a.localeCompare(b, 'fr'));
  }

  const grouped = useMemo(() => groupPlayers(players, dimension), [players, dimension, t]);
  const sortedKeys = useMemo(() => sortGroupKeys(Object.keys(grouped), dimension), [grouped, dimension, t]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ArrowDownAZ className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('tri.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {players.length} {players.length > 1 ? t('tri.subtitle_plural', { players: players.length, groups: sortedKeys.length }).split('·')[0].trim() : ''} · {sortedKeys.length} {sortedKeys.length > 1 ? t('tri.contracts') : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground font-medium">{t('tri.group_by')}</span>
          <Select value={dimension} onValueChange={v => setDimension(v as Dimension)}>
            <SelectTrigger className="w-[200px] rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIMENSIONS.map(d => (
                <SelectItem key={d.value} value={d.value}>
                  <span className="flex items-center gap-2">{d.icon} {d.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-8">
        {sortedKeys.map(groupKey => {
          const groupPlayers = grouped[groupKey];
          return (
            <div key={groupKey}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-bold">{groupKey}</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-muted text-xs font-bold text-muted-foreground">{groupPlayers.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {groupPlayers.sort((a, b) => b.potential - a.potential).map(player => (
                  <Link key={player.id} to={`/player/${player.id}`}>
                    <Card className="border-none card-warm group h-full hover:scale-[1.02] transition-all duration-200 overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="md" />
                          <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-sm truncate group-hover:text-primary transition-colors">{player.name}</h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <FlagIcon nationality={player.nationality} size="sm" />
                              <ClubBadge club={player.club} size="sm" />
                              <span className="text-xs text-muted-foreground truncate">{player.club}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="px-2 py-0.5 rounded-md bg-muted text-xs font-medium">{posShort[player.position]}</span>
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Pot.</p>
                              <p className="text-sm font-bold font-mono">{player.potential}</p>
                            </div>
                            <OpinionBadge opinion={player.general_opinion} size="sm" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
