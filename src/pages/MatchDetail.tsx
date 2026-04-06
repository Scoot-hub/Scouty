import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMatchDetail, type MatchEvent, type MatchStat } from '@/hooks/use-api-football';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ChevronLeft, MapPin, User, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUtcOffset, formatTimeWithOffset } from '@/hooks/use-utc-offset';

// ── Helpers ────────────────────────────────────────────────────────────────────

function countryFlag(code: string) {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65),
  );
}

function isLive(status: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  if (s === 'HT' || s === '1H' || s === '2H' || s === 'ET' || s === 'LIVE') return true;
  return /^\d/.test(status);
}

function isFinished(status: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'FT' || s === 'AET' || s === 'AP' || s === 'PEN';
}

function formatMatchDate(dateStr: string | null, locale?: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Event icon ────────────────────────────────────────────────────────────────

function EventIcon({ type }: { type: MatchEvent['type'] }) {
  switch (type) {
    case 'goal':
      return <span className="text-base">⚽</span>;
    case 'own_goal':
      return <span className="text-base">⚽</span>;
    case 'yellow_card':
      return <span className="inline-block w-3 h-4 rounded-sm bg-yellow-400 shrink-0" />;
    case 'second_yellow':
      return (
        <span className="relative inline-flex shrink-0">
          <span className="inline-block w-3 h-4 rounded-sm bg-yellow-400" />
          <span className="absolute -top-0.5 left-1 inline-block w-3 h-4 rounded-sm bg-red-500" />
        </span>
      );
    case 'red_card':
      return <span className="inline-block w-3 h-4 rounded-sm bg-red-500 shrink-0" />;
    case 'substitution':
      return <span className="text-sm font-bold text-green-500">⇄</span>;
    case 'penalty_missed':
      return <span className="text-base">✗</span>;
    case 'var':
      return <span className="text-[10px] font-black text-blue-500 border border-blue-500 rounded px-0.5">VAR</span>;
    default:
      return null;
  }
}

// ── Stat Bar ──────────────────────────────────────────────────────────────────

function StatBar({ stat, t }: { stat: MatchStat; t: (k: string, o?: object) => string }) {
  const homeVal = stat.home != null ? parseFloat(String(stat.home)) : null;
  const awayVal = stat.away != null ? parseFloat(String(stat.away)) : null;
  const total = (homeVal ?? 0) + (awayVal ?? 0);
  const homePercent = total > 0 ? Math.round(((homeVal ?? 0) / total) * 100) : 50;
  const awayPercent = 100 - homePercent;

  const statLabel = (key: string) => {
    const map: Record<string, string> = {
      'Ball Possession': t('match_detail.stat_possession'),
      'Possession': t('match_detail.stat_possession'),
      'Total Shots': t('match_detail.stat_shots'),
      'Shots': t('match_detail.stat_shots'),
      'Shots on Target': t('match_detail.stat_shots_on_target'),
      'Shots Off Target': t('match_detail.stat_shots_off_target'),
      'Blocked Shots': t('match_detail.stat_shots_blocked'),
      'Corners': t('match_detail.stat_corners'),
      'Corner Kicks': t('match_detail.stat_corners'),
      'Fouls': t('match_detail.stat_fouls'),
      'Yellow Cards': t('match_detail.stat_yellow_cards'),
      'Red Cards': t('match_detail.stat_red_cards'),
      'Offsides': t('match_detail.stat_offsides'),
      'Goalkeeper Saves': t('match_detail.stat_saves'),
      'Saves': t('match_detail.stat_saves'),
      'Passes': t('match_detail.stat_passes'),
      'Total passes': t('match_detail.stat_passes'),
      'Pass Accuracy': t('match_detail.stat_pass_accuracy'),
      'Attacks': t('match_detail.stat_attacks'),
      'Dangerous Attacks': t('match_detail.stat_dangerous_attacks'),
    };
    return map[key] ?? key;
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="w-10 text-left">{stat.home ?? '–'}</span>
        <span className="text-muted-foreground text-[11px] text-center flex-1">{statLabel(stat.type)}</span>
        <span className="w-10 text-right">{stat.away ?? '–'}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        <div
          className="bg-primary transition-all duration-300"
          style={{ width: `${homePercent}%` }}
        />
        <div
          className="bg-muted-foreground/30 transition-all duration-300"
          style={{ width: `${awayPercent}%` }}
        />
      </div>
    </div>
  );
}

// ── Lineup column ─────────────────────────────────────────────────────────────

function LineupColumn({ team, formation, players, subs, side }: {
  team: string;
  formation: string | null;
  players: { name: string; number: number | null; position: string; captain?: boolean; yellow?: boolean; red?: boolean; substituted?: boolean }[];
  subs: { name: string; number: number | null; position: string }[];
  side: 'home' | 'away';
}) {
  return (
    <div className={cn('flex-1 min-w-0', side === 'away' && 'text-right')}>
      <div className={cn('flex items-center gap-2 mb-3', side === 'away' && 'flex-row-reverse')}>
        <span className="text-sm font-bold truncate">{team}</span>
        {formation && (
          <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{formation}</span>
        )}
      </div>

      {/* Starters */}
      <div className="space-y-1">
        {players.map((p, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center gap-2 py-1 px-2 rounded-md text-xs',
              side === 'away' && 'flex-row-reverse',
              p.substituted && 'opacity-50',
            )}
          >
            {p.number != null && (
              <span className="w-5 text-center font-mono text-[10px] text-muted-foreground shrink-0">{p.number}</span>
            )}
            <span className={cn('font-medium truncate', side === 'away' && 'text-right')}>
              {p.name}
              {p.captain && <span className="ml-1 text-[9px] text-amber-500 font-black">©</span>}
            </span>
            <span className="flex items-center gap-0.5 shrink-0 ml-auto">
              {p.yellow && <span className="inline-block w-2.5 h-3.5 rounded-sm bg-yellow-400" />}
              {p.red && <span className="inline-block w-2.5 h-3.5 rounded-sm bg-red-500" />}
            </span>
          </div>
        ))}
      </div>

      {/* Substitutes */}
      {subs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed space-y-1">
          {subs.map((p, i) => (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 py-1 px-2 rounded-md text-xs text-muted-foreground',
                side === 'away' && 'flex-row-reverse',
              )}
            >
              {p.number != null && (
                <span className="w-5 text-center font-mono text-[10px] shrink-0">{p.number}</span>
              )}
              <span className={cn('truncate', side === 'away' && 'text-right')}>{p.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const { utcOffset } = useUtcOffset();

  // Fallback info from URL params while loading
  const initHomeTeam = searchParams.get('home') ?? '';
  const initAwayTeam = searchParams.get('away') ?? '';
  const initCompetition = searchParams.get('competition') ?? '';
  const initDate = searchParams.get('date') ?? '';

  const { data, isLoading, error, isError } = useMatchDetail(matchId ?? null);

  const live = data ? isLive(data.status) : false;
  const finished = data ? isFinished(data.status) : false;
  const hasScore = data && data.score_home != null && data.score_away != null;
  const hasEvents = data && data.events.length > 0;
  const hasStats = data && data.stats.length > 0;
  const hasLineups = data && data.lineups.available;

  const homeTeam = data?.home_team || initHomeTeam;
  const awayTeam = data?.away_team || initAwayTeam;
  const competition = data?.competition || initCompetition;
  const matchDate = data?.match_date || initDate;
  const flag = data ? countryFlag(data.country_code) : '';

  // Split events by team
  const homeEvents = data?.events.filter(e => e.team === 'home').sort((a, b) => a.minute - b.minute) ?? [];
  const awayEvents = data?.events.filter(e => e.team === 'away').sort((a, b) => a.minute - b.minute) ?? [];
  const allEventsSorted = data?.events.slice().sort((a, b) => a.minute - b.minute) ?? [];

  const [tab, setTab] = useState<'events' | 'stats' | 'lineup'>('events');

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back navigation */}
      <div className="mb-4">
        <Link
          to="/fixtures"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('match_detail.back_to_fixtures')}
        </Link>
      </div>

      {/* Competition header */}
      <div className="flex items-center gap-2 mb-4">
        {flag && <span className="text-lg">{flag}</span>}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {competition || t('match_detail.loading')}
          </p>
          {matchDate && (
            <p className="text-[11px] text-muted-foreground">
              {formatMatchDate(matchDate, i18n.language)}
            </p>
          )}
        </div>
      </div>

      {/* ── Scoreboard card ── */}
      <Card className={cn(
        'mb-6 overflow-hidden',
        live && 'ring-2 ring-green-500/40',
      )}>
        {live && (
          <div className="h-0.5 bg-gradient-to-r from-green-500 to-green-400" />
        )}
        <CardContent className="p-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <AlertTriangle className="w-6 h-6 text-destructive" />
              <p className="text-sm font-medium">{t('match_detail.error_loading')}</p>
              <p className="text-xs text-muted-foreground">{t('match_detail.error_desc')}</p>
            </div>
          ) : (
            <>
              {/* Status pill */}
              <div className="flex justify-center mb-4">
                {live && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 dark:text-green-400 animate-pulse">
                    {data.status === 'HT' ? t('match_detail.half_time') : `${data.status}'`}
                  </span>
                )}
                {finished && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
                    {data.status}
                  </span>
                )}
                {!live && !finished && data && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground">
                    {formatTimeWithOffset(data.match_time, utcOffset) || t('match_detail.not_started')}
                  </span>
                )}
              </div>

              {/* Teams + Score */}
              <div className="flex items-center gap-4">
                {/* Home team */}
                <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  {data?.home_badge ? (
                    <img src={data.home_badge} alt="" className="w-14 h-14 object-contain" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-black text-muted-foreground">
                      {homeTeam.slice(0, 1)}
                    </div>
                  )}
                  <span className="text-sm font-bold text-center leading-tight">{homeTeam}</span>
                </div>

                {/* Score */}
                <div className="shrink-0 text-center min-w-[80px]">
                  {hasScore ? (
                    <>
                      <div className={cn(
                        'text-4xl font-extrabold font-mono tabular-nums',
                        live && 'text-green-600 dark:text-green-400',
                      )}>
                        {data!.score_home} – {data!.score_away}
                      </div>
                      {data!.ht_score_home != null && data!.ht_score_away != null && !live && (
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {t('match_detail.ht')} {data!.ht_score_home}–{data!.ht_score_away}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-2xl font-bold text-muted-foreground">VS</div>
                  )}
                </div>

                {/* Away team */}
                <div className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  {data?.away_badge ? (
                    <img src={data.away_badge} alt="" className="w-14 h-14 object-contain" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-xl font-black text-muted-foreground">
                      {awayTeam.slice(0, 1)}
                    </div>
                  )}
                  <span className="text-sm font-bold text-center leading-tight">{awayTeam}</span>
                </div>
              </div>

              {/* Venue / Referee */}
              {(data?.venue || data?.referee) && (
                <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
                  {data.venue && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {data.venue}
                    </span>
                  )}
                  {data.referee && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {data.referee}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Tabs: Events / Stats / Lineup ── */}
      {!isLoading && !isError && data && (hasEvents || hasStats || hasLineups) && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="rounded-xl mb-4 w-full">
            <TabsTrigger value="events" className="flex-1 rounded-lg">
              {t('match_detail.tab_events')}
              {hasEvents && (
                <span className="ml-1.5 text-[10px] bg-muted-foreground/20 rounded-full px-1.5 py-0.5 font-bold">
                  {data.events.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex-1 rounded-lg" disabled={!hasStats}>
              {t('match_detail.tab_stats')}
            </TabsTrigger>
            <TabsTrigger value="lineup" className="flex-1 rounded-lg" disabled={!hasLineups}>
              {t('match_detail.tab_lineup')}
            </TabsTrigger>
          </TabsList>

          {/* Events */}
          <TabsContent value="events">
            {!hasEvents ? (
              <NoData label={t('match_detail.no_events')} />
            ) : (
              <div className="space-y-1.5">
                {/* Show events on both sides like a real timeline */}
                {allEventsSorted.map((ev, i) => {
                  const isHome = ev.team === 'home';
                  return (
                    <div key={i} className="flex items-center gap-2">
                      {/* Home side */}
                      <div className={cn('flex-1 flex items-center justify-end gap-2 text-xs', !isHome && 'opacity-0 pointer-events-none')}>
                        <span className="truncate font-medium text-right">
                          {ev.player}
                          {ev.type === 'own_goal' && <span className="text-[10px] text-red-500 ml-1">(og)</span>}
                          {ev.type === 'substitution' && ev.player_in && (
                            <span className="text-[10px] text-muted-foreground block">↑ {ev.player_in}</span>
                          )}
                        </span>
                        <EventIcon type={ev.type} />
                      </div>

                      {/* Minute */}
                      <div className="shrink-0 w-12 text-center">
                        <span className="text-[10px] font-mono bg-muted rounded px-1.5 py-0.5 font-semibold">
                          {ev.minute}{ev.extra_time > 0 ? `+${ev.extra_time}` : ''}'
                        </span>
                      </div>

                      {/* Away side */}
                      <div className={cn('flex-1 flex items-center gap-2 text-xs', isHome && 'opacity-0 pointer-events-none')}>
                        <EventIcon type={ev.type} />
                        <span className="truncate font-medium">
                          {ev.player}
                          {ev.type === 'own_goal' && <span className="text-[10px] text-red-500 ml-1">(og)</span>}
                          {ev.type === 'substitution' && ev.player_in && (
                            <span className="text-[10px] text-muted-foreground block">↑ {ev.player_in}</span>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Stats */}
          <TabsContent value="stats">
            {!hasStats ? (
              <NoData label={t('match_detail.no_stats')} />
            ) : (
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Team labels */}
                  <div className="flex items-center justify-between text-xs font-bold">
                    <div className="flex items-center gap-2">
                      {data.home_badge && <img src={data.home_badge} alt="" className="w-5 h-5 object-contain" />}
                      <span className="truncate max-w-[120px]">{data.home_team}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-row-reverse">
                      {data.away_badge && <img src={data.away_badge} alt="" className="w-5 h-5 object-contain" />}
                      <span className="truncate max-w-[120px]">{data.away_team}</span>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  {data.stats.map((s, i) => (
                    <StatBar key={i} stat={s} t={t} />
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Lineup */}
          <TabsContent value="lineup">
            {!hasLineups ? (
              <NoData label={t('match_detail.no_lineup')} />
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="flex gap-6">
                    <LineupColumn
                      team={data.home_team}
                      formation={data.lineups.home.formation}
                      players={data.lineups.home.players}
                      subs={data.lineups.home.subs}
                      side="home"
                    />
                    <div className="w-px bg-border shrink-0" />
                    <LineupColumn
                      team={data.away_team}
                      formation={data.lineups.away.formation}
                      players={data.lineups.away.players}
                      subs={data.lineups.away.subs}
                      side="away"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Fallback: nothing available yet */}
      {!isLoading && !isError && data && !hasEvents && !hasStats && !hasLineups && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm font-semibold text-muted-foreground">{t('match_detail.no_data')}</p>
            <p className="text-xs text-muted-foreground mt-1">{t('match_detail.no_data_desc')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NoData({ label }: { label: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
