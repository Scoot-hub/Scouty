import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, UserPlus, ExternalLink, Swords, Clock } from 'lucide-react';
import { translateCountry } from '@/types/player';
import { cn } from '@/lib/utils';
import type { LivescoreEvent } from '@/hooks/use-api-football';

export type DayMatch = LivescoreEvent & { competition: string; country: string };

export interface MatchPlayer {
  name: string;
  tmPath: string;
  tmId: string | null;
  photo: string | null;
  position: string;
  age: number | null;
  nationality: string;
  club: string;
  clubLogo: string;
  marketValue: string;
  team?: string;
  isHome?: boolean;
  isStarter?: boolean;
}

interface MatchSquadResponse {
  players: MatchPlayer[];
  available: boolean;
  source?: 'lineup' | 'squad';
  homeTeam: string;
  awayTeam: string;
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

const isLiveStatus = (s: string) => {
  if (!s) return false;
  const u = s.toUpperCase();
  return u === 'HT' || u === '1H' || u === '2H' || u === 'ET' || u === 'LIVE' || /^\d/.test(s);
};
const isFinishedStatus = (s: string) => {
  const u = (s || '').toUpperCase();
  return u === 'FT' || u === 'AET' || u === 'AP' || u === 'PEN';
};

const playerKey = (p: MatchPlayer) => p.tmId || `${p.team || ''}-${p.name}`;

function guessPosition(posText: string): string {
  if (!posText) return 'MC';
  const p = posText.toLowerCase();
  if (p.includes('gardien') || p.includes('keeper') || p.includes('tor')) return 'GK';
  if (p.includes('défenseur central') || p.includes('innen')) return 'DC';
  if (p.includes('latéral droit') || p.includes('rechter')) return 'LD';
  if (p.includes('latéral gauche') || p.includes('linker')) return 'LG';
  if (p.includes('milieu défensif') || p.includes('defensives')) return 'MDef';
  if (p.includes('milieu central') || p.includes('zentrales')) return 'MC';
  if (p.includes('milieu offensif') || p.includes('offensives')) return 'MO';
  if (p.includes('ailier droit') || p.includes('rechtsaußen')) return 'AD';
  if (p.includes('ailier gauche') || p.includes('linksaußen')) return 'AG';
  if (p.includes('avant-centre') || p.includes('mittelstürmer') || p.includes('attaquant')) return 'ATT';
  if (p.includes('défenseur') || p.includes('abwehr')) return 'DC';
  if (p.includes('milieu') || p.includes('mittelfeld')) return 'MC';
  return 'MC';
}

// Team crest with a neutral placeholder when no badge is available
export function TeamBadge({ src, size = 'w-6 h-6' }: { src: string | null | undefined; size?: string }) {
  if (!src) return <div className={cn(size, 'shrink-0 rounded-full bg-muted')} />;
  return <img src={src} alt="" className={cn(size, 'object-contain shrink-0')} loading="lazy" />;
}

// Fixture card in the picker — mirrors the Match tab's EventCard look
export function MatchPickerCard({ match, selected, onSelect }: { match: DayMatch; selected: boolean; onSelect: () => void }) {
  const live = isLiveStatus(match.status);
  const finished = isFinishedStatus(match.status);
  const hasScore = match.score_home !== null && match.score_away !== null;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'text-left rounded-xl border bg-card p-3 transition-all duration-200 hover:scale-[1.01] hover:border-primary/40',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground truncate">{match.competition}</span>
        {live ? (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 dark:text-green-400 animate-pulse">
            {match.status === 'HT' ? 'HT' : `${match.status}'`}
          </span>
        ) : finished ? (
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">{match.status}</span>
        ) : match.match_time ? (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><Clock className="w-3 h-3" />{match.match_time}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center justify-end gap-1.5 min-w-0">
          <span className="text-xs font-semibold truncate text-right">{match.home_team}</span>
          <TeamBadge src={match.home_badge} size="w-5 h-5" />
        </div>
        <div className="shrink-0 w-10 text-center">
          {hasScore ? (
            <span className={cn('text-sm font-extrabold font-mono', live && 'text-green-600 dark:text-green-400')}>{match.score_home}-{match.score_away}</span>
          ) : (
            <span className="text-[10px] font-bold text-muted-foreground/70">VS</span>
          )}
        </div>
        <div className="flex-1 flex items-center gap-1.5 min-w-0">
          <TeamBadge src={match.away_badge} size="w-5 h-5" />
          <span className="text-xs font-semibold truncate">{match.away_team}</span>
        </div>
      </div>
    </button>
  );
}

function MatchBanner({ match, count, source, t }: { match: DayMatch; count: number; source?: string; t: TFn }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="font-bold text-sm md:text-base truncate text-right">{match.home_team}</span>
            <TeamBadge src={match.home_badge} size="w-8 h-8" />
          </div>
          <span className="shrink-0 text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-1">VS</span>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <TeamBadge src={match.away_badge} size="w-8 h-8" />
            <span className="font-bold text-sm md:text-base truncate">{match.away_team}</span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          {match.competition && <span className="truncate max-w-[45%]">{match.competition}</span>}
          {match.competition && <span className="text-muted-foreground/40">·</span>}
          <span>{t('discover.results_count', { count })}</span>
          {source && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-primary/80 font-medium">
                {source === 'lineup' ? t('discover.match_source_lineup') : t('discover.match_source_squad')}
              </span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MatchPlayerCard({ player, lang, t, adding, onAdd }: {
  player: MatchPlayer; lang: string; t: TFn; adding: boolean; onAdd: () => void;
}) {
  const meta = [
    player.position,
    player.age ? `${player.age} ${t('discover.years')}` : '',
    player.nationality ? translateCountry(player.nationality, lang) : '',
  ].filter(Boolean).join(' · ');
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-muted overflow-hidden shrink-0">
            {player.photo ? (
              <img src={player.photo} alt={player.name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-base font-bold text-muted-foreground">{player.name[0]}</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1.5">
              <h4 className="text-sm font-bold leading-tight truncate">{player.name}</h4>
              <div className="flex items-center gap-1.5 shrink-0">
                {player.isStarter !== undefined && (
                  <Badge variant={player.isStarter ? 'secondary' : 'outline'} className="text-[9px] py-0 px-1">
                    {player.isStarter ? t('discover.match_starter') : t('discover.match_sub')}
                  </Badge>
                )}
                {player.tmPath && (
                  <a
                    href={`https://www.transfermarkt.fr${player.tmPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
            {meta && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{meta}</p>}
            <div className="flex items-center justify-between gap-2 mt-2">
              {player.marketValue
                ? <Badge variant="outline" className="font-mono text-[10px]">{player.marketValue}</Badge>
                : <span />}
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onAdd} disabled={adding}>
                {adding
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <><UserPlus className="w-3.5 h-3.5 mr-1" />{t('discover.add')}</>}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchTeamSection({ players, fallbackName, badge, isHome, lang, t, adding, onAdd }: {
  players: MatchPlayer[];
  fallbackName: string;
  badge: string | null | undefined;
  isHome: boolean;
  lang: string;
  t: TFn;
  adding: string | null;
  onAdd: (p: MatchPlayer) => void;
}) {
  if (!players.length) return null;
  const teamName = players[0]?.team || fallbackName;
  // Starters first when we have a real lineup
  const ordered = [...players].sort((a, b) => (b.isStarter ? 1 : 0) - (a.isStarter ? 1 : 0));
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <TeamBadge src={badge} size="w-6 h-6" />
        <h3 className="font-bold text-sm truncate">{teamName}</h3>
        <Badge variant={isHome ? 'secondary' : 'outline'} className="text-[10px] py-0">
          {isHome ? t('discover.match_home') : t('discover.match_away')}
        </Badge>
        <span className="text-[11px] text-muted-foreground/70 ml-auto">{players.length}</span>
      </div>
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((p, i) => (
          <MatchPlayerCard
            key={playerKey(p) || i}
            player={p}
            lang={lang}
            t={t}
            adding={adding === playerKey(p)}
            onAdd={() => onAdd(p)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Self-contained "scout a match" panel: fetches both teams' players for a fixture
 * (real lineup when available, else full TM squads) and lets the user add any of
 * them to their personal database. Used by /discover (match mode) and MatchDetail.
 */
export function MatchSquadScout({ match }: { match: DayMatch }) {
  const { t, i18n } = useTranslation();
  const [adding, setAdding] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['discover-match-players', match.id, match.home_team, match.away_team],
    queryFn: async (): Promise<MatchSquadResponse> => {
      const { data, error } = await supabase.functions.invoke('discover-match-players', {
        body: { matchId: match.id, homeTeam: match.home_team, awayTeam: match.away_team },
      });
      if (error) throw error;
      return data as MatchSquadResponse;
    },
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  const handleAdd = async (player: MatchPlayer) => {
    setAdding(playerKey(player));
    try {
      const { error } = await supabase.from('players').insert({
        name: player.name,
        club: player.club,
        nationality: player.nationality.split(',')[0]?.trim() || '',
        position: guessPosition(player.position),
        generation: player.age ? new Date().getFullYear() - player.age : 2000,
        market_value: player.marketValue,
        transfermarkt_id: player.tmId,
        photo_url: player.photo,
      });
      if (error) throw error;
      toast.success(t('discover.player_added', { name: player.name }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAdding(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground">{t('discover.match_enriching')}</p>
      </div>
    );
  }

  const players = data?.players || [];

  if (data && !data.available) {
    return (
      <div className="text-center py-16">
        <Swords className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">{t('discover.match_unavailable_title')}</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{t('discover.match_unavailable_desc')}</p>
      </div>
    );
  }

  if (!players.length) {
    return (
      <div className="text-center py-16">
        <Swords className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{t('discover.no_results')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MatchBanner match={match} count={players.length} source={data?.source} t={t} />
      <MatchTeamSection
        players={players.filter(p => p.isHome)}
        fallbackName={match.home_team}
        badge={match.home_badge}
        isHome
        lang={i18n.language}
        t={t}
        adding={adding}
        onAdd={handleAdd}
      />
      <MatchTeamSection
        players={players.filter(p => !p.isHome)}
        fallbackName={match.away_team}
        badge={match.away_badge}
        isHome={false}
        lang={i18n.language}
        t={t}
        adding={adding}
        onAdd={handleAdd}
      />
    </div>
  );
}
