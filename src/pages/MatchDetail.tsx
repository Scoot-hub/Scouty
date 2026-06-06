import { useState, lazy, Suspense } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMatchDetail, type MatchEvent, type MatchStat } from '@/hooks/use-api-football';
import { useScoreBatVideos, useFotMobXG, useFDOrgForm, useFDOrgH2H, type FormEntry } from '@/hooks/use-match-enrichment';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ChevronLeft, MapPin, User, AlertTriangle, ExternalLink, Play, TrendingUp, History, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUtcOffset, formatTimeWithOffset } from '@/hooks/use-utc-offset';
import { useResolvePlayerNames, type PlayerNameMatch } from '@/hooks/use-resolve-player-names';
import { MatchSquadScout, type DayMatch } from '@/components/match/MatchSquadScout';

const LazyStatsBombMatchDetail = lazy(() => import('@/components/fixtures/StatsBombMatchDetail'));

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
      return <span className="text-base leading-none">⚽</span>;
    case 'own_goal':
      return (
        <span className="inline-flex items-center gap-0.5">
          <span className="text-base leading-none opacity-70">⚽</span>
          <span className="text-[9px] font-black text-red-500 leading-none">OG</span>
        </span>
      );
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
  const homeStr = String(stat.home ?? '');
  const awayStr = String(stat.away ?? '');
  const isAlreadyPercent = homeStr.includes('%') || awayStr.includes('%')
    || /possession|accuracy/i.test(stat.type);
  const homeVal = stat.home != null ? parseFloat(homeStr.replace('%', '')) : null;
  const awayVal = stat.away != null ? parseFloat(awayStr.replace('%', '')) : null;
  let homePercent: number;
  if (isAlreadyPercent) {
    homePercent = homeVal != null ? Math.min(100, Math.max(0, Math.round(homeVal))) : 50;
  } else {
    const total = (homeVal ?? 0) + (awayVal ?? 0);
    homePercent = total > 0 ? Math.round(((homeVal ?? 0) / total) * 100) : 50;
  }
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

// ── Form strip (W/D/L badges, last 5 matches) ─────────────────────────────────

function FormStrip({ form, align }: { form: FormEntry[]; align: 'left' | 'right' }) {
  const colors: Record<string, string> = {
    W: 'bg-green-500 text-white',
    D: 'bg-amber-400 text-white',
    L: 'bg-red-500 text-white',
  };
  const dots = align === 'left' ? form : [...form].reverse();
  return (
    <div className={cn('flex gap-1 mt-1', align === 'right' ? 'justify-end' : 'justify-start')}>
      {dots.map((f, i) => (
        <span
          key={i}
          title={`${f.isHome ? 'D' : 'E'} vs ${f.opponent} ${f.myScore}-${f.opScore}`}
          className={cn(
            'inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black shrink-0',
            colors[f.result] ?? 'bg-muted text-muted-foreground'
          )}
        >
          {f.result}
        </span>
      ))}
    </div>
  );
}

// ── xG display row ────────────────────────────────────────────────────────────

function XGRow({ home, away }: { home: number; away: number }) {
  const total = home + away;
  const homePct = total > 0 ? Math.round((home / total) * 100) : 50;
  return (
    <div className="space-y-1 py-2 border-t border-primary/20">
      <div className="flex items-center justify-between text-xs font-bold text-primary">
        <span className="w-12 text-left tabular-nums">{home.toFixed(2)}</span>
        <span className="flex items-center gap-1 text-[11px] text-center flex-1 justify-center">
          <TrendingUp className="w-3 h-3" />
          xG
        </span>
        <span className="w-12 text-right tabular-nums">{away.toFixed(2)}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        <div className="bg-primary transition-all" style={{ width: `${homePct}%` }} />
        <div className="bg-muted-foreground/30" style={{ width: `${100 - homePct}%` }} />
      </div>
      <p className="text-[9px] text-muted-foreground/50 text-center">Source : FotMob</p>
    </div>
  );
}

// ── H2H mini-table ────────────────────────────────────────────────────────────

function H2HSection({ matches, homeTeam, t }: { matches: import('@/hooks/use-match-enrichment').H2HMatch[]; homeTeam: string; t: (k: string, o?: Record<string, unknown>) => string }) {
  if (!matches.length) return null;
  return (
    <div className="mt-4 pt-4 border-t border-border/40 space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
        <History className="w-3.5 h-3.5" />
        {t('match_detail.h2h')}
      </p>
      <div className="space-y-1">
        {matches.map((m, i) => {
          const isHomeHome = m.homeTeam.toLowerCase().includes(homeTeam.toLowerCase().split(' ')[0]);
          const myScore = isHomeHome ? m.homeScore : m.awayScore;
          const opScore = isHomeHome ? m.awayScore : m.homeScore;
          const result = myScore > opScore ? 'W' : myScore < opScore ? 'L' : 'D';
          const col = result === 'W' ? 'text-green-600 dark:text-green-400' : result === 'L' ? 'text-red-500' : 'text-amber-500';
          return (
            <div key={i} className="flex items-center justify-between text-xs text-muted-foreground gap-2">
              <span className="text-[10px] shrink-0">{new Date(m.date).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
              <span className="truncate text-[10px] flex-1 text-center">{m.homeTeam} {m.homeScore}–{m.awayScore} {m.awayTeam}</span>
              <span className={cn('font-black text-[10px] shrink-0', col)}>{result}</span>
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-muted-foreground/50">Source : football-data.org</p>
    </div>
  );
}

// ── Lineup column ─────────────────────────────────────────────────────────────

function PlayerName({ name, matches, className }: {
  name: string;
  matches: Record<string, PlayerNameMatch>;
  className?: string;
}) {
  const match = matches[name];
  if (match) {
    return (
      <Link
        to={`/player/${match.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'inline-flex items-center gap-1 font-semibold text-primary hover:underline underline-offset-2',
          className,
        )}
      >
        {name}
        <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
      </Link>
    );
  }
  return <span className={className}>{name}</span>;
}

function LineupColumn({ team, formation, players, subs, side, matches }: {
  team: string;
  formation: string | null;
  players: { name: string; number: number | null; position: string; captain?: boolean; yellow?: boolean; red?: boolean; substituted?: boolean }[];
  subs: { name: string; number: number | null; position: string }[];
  side: 'home' | 'away';
  matches: Record<string, PlayerNameMatch>;
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
              <PlayerName name={p.name} matches={matches} />
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
              <PlayerName name={p.name} matches={matches} className={cn('truncate', side === 'away' && 'text-right')} />
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

  // StatsBomb match: matchId starts with "sb-"
  const isSbMatch = matchId?.startsWith('sb-');
  const sbMatchId = isSbMatch ? parseInt(matchId!.slice(3)) : null;

  if (isSbMatch && sbMatchId) {
    return (
      <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
        <LazyStatsBombMatchDetail matchId={sbMatchId} />
      </Suspense>
    );
  }

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

  // ── Enrichment (free external APIs) ──────────────────────────────────────────
  const { data: videosData } = useScoreBatVideos(homeTeam || null, awayTeam || null);
  const { data: xgData }     = useFotMobXG(homeTeam || null, awayTeam || null, (data?.match_date || initDate) || null);
  const { data: homeFormData } = useFDOrgForm(homeTeam || null);
  const { data: awayFormData } = useFDOrgForm(awayTeam || null);
  const { data: h2hData }    = useFDOrgH2H(homeTeam || null, awayTeam || null);

  const videos   = videosData?.videos ?? [];
  const xg       = xgData?.xg ?? null;
  const homeForm = homeFormData?.form ?? null;
  const awayForm = awayFormData?.form ?? null;
  const h2hMatches = h2hData?.matches ?? [];
  const hasVideos = videos.length > 0;

  const [activeVideoIdx, setActiveVideoIdx] = useState<number | null>(null);
  const matchDate = data?.match_date || initDate;
  const flag = data ? countryFlag(data.country_code) : '';

  // Split events by team
  const homeEvents = data?.events.filter(e => e.team === 'home').sort((a, b) => a.minute - b.minute) ?? [];
  const awayEvents = data?.events.filter(e => e.team === 'away').sort((a, b) => a.minute - b.minute) ?? [];
  const allEventsSorted = data?.events.slice().sort((a, b) => a.minute - b.minute) ?? [];

  const [tab, setTab] = useState<'events' | 'stats' | 'lineup' | 'videos' | 'scout'>('events');

  // Resolve lineup names against the user's own roster so matched players become clickable
  const lineupNames = data?.lineups.available
    ? [
        ...data.lineups.home.players.map(p => p.name),
        ...data.lineups.home.subs.map(p => p.name),
        ...data.lineups.away.players.map(p => p.name),
        ...data.lineups.away.subs.map(p => p.name),
      ].filter(Boolean)
    : [];
  const { data: nameMatches } = useResolvePlayerNames(
    lineupNames,
    data?.home_team,
    data?.away_team,
  );
  const matches = nameMatches ?? {};

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
                  {homeForm && homeForm.length > 0 && (
                    <FormStrip form={homeForm} align="left" />
                  )}
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
                  {awayForm && awayForm.length > 0 && (
                    <FormStrip form={awayForm} align="right" />
                  )}
                </div>
              </div>

              {/* H2H section */}
              {h2hMatches.length > 0 && (
                <H2HSection matches={h2hMatches} homeTeam={homeTeam} t={t} />
              )}

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
      {!isLoading && !isError && data && (hasEvents || hasStats || hasLineups || hasVideos) && (
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
            <TabsTrigger value="videos" className="flex-1 rounded-lg" disabled={!hasVideos}>
              <Play className="w-3 h-3 mr-1" />
              {t('match_detail.tab_videos')}
              {hasVideos && (
                <span className="ml-1 text-[10px] bg-muted-foreground/20 rounded-full px-1.5 py-0.5 font-bold">
                  {videos.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="scout" className="flex-1 rounded-lg">
              <Zap className="w-3 h-3 mr-1" />
              {t('match_detail.tab_scout')}
            </TabsTrigger>
          </TabsList>

          {/* Events */}
          <TabsContent value="events">
            {!hasEvents ? (
              <NoData label={t('match_detail.no_events')} />
            ) : (
              <>
              {/* Warn when goal events count doesn't match the final score */}
              {hasScore && (() => {
                const goalEvents = data.events.filter(e => e.type === 'goal' || e.type === 'own_goal').length;
                const scoreGoals = (data.score_home ?? 0) + (data.score_away ?? 0);
                return goalEvents !== scoreGoals ? (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {t('match_detail.events_incomplete')}
                  </div>
                ) : null;
              })()}
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
              </>
            )}
          </TabsContent>

          {/* Stats */}
          <TabsContent value="stats">
            {!hasStats ? (
              <NoData label={t('match_detail.no_stats')} />
            ) : (
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 italic">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {t('match_detail.stats_disclaimer')}
                  </div>
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
                  {/* xG row — from FotMob (free) */}
                  {xg && xg.home !== null && xg.away !== null && (
                    <XGRow home={xg.home} away={xg.away} />
                  )}
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
                      matches={matches}
                    />
                    <div className="w-px bg-border shrink-0" />
                    <LineupColumn
                      team={data.away_team}
                      formation={data.lineups.away.formation}
                      players={data.lineups.away.players}
                      subs={data.lineups.away.subs}
                      side="away"
                      matches={matches}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Videos — ScoreBat (free) */}
          <TabsContent value="videos">
            {!hasVideos ? (
              <NoData label={t('match_detail.no_videos')} />
            ) : (
              <div className="space-y-4">
                <p className="text-[10px] text-muted-foreground/60 italic flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> {t('match_detail.video_source')}
                </p>
                {videos.map((v, i) => (
                  <div key={i} className="rounded-xl border bg-card overflow-hidden">
                    {activeVideoIdx === i ? (
                      <div
                        className="aspect-video [&_iframe]:w-full [&_iframe]:h-full"
                        dangerouslySetInnerHTML={{ __html: v.videos?.[0]?.embed ?? '' }}
                      />
                    ) : (
                      <button
                        className="relative w-full group"
                        onClick={() => setActiveVideoIdx(i)}
                      >
                        {v.thumbnail ? (
                          <img src={v.thumbnail} alt={v.title} className="w-full aspect-video object-cover" />
                        ) : (
                          <div className="w-full aspect-video bg-muted flex items-center justify-center">
                            <Play className="w-8 h-8 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                            <Play className="w-5 h-5 text-white ml-0.5" />
                          </div>
                        </div>
                      </button>
                    )}
                    <div className="p-3">
                      <p className="text-sm font-medium line-clamp-2">{v.title}</p>
                      {v.competition?.name && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{v.competition.name}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Scout — preview & add players of this fixture (real lineup or full squads) */}
          <TabsContent value="scout">
            <MatchSquadScout
              match={{
                id: matchId ?? '',
                home_team: data.home_team,
                away_team: data.away_team,
                match_time: data.match_time,
                score_home: data.score_home,
                score_away: data.score_away,
                ht_score_home: data.ht_score_home,
                ht_score_away: data.ht_score_away,
                status: data.status,
                home_badge: data.home_badge,
                away_badge: data.away_badge,
                competition: competition,
                country: data.country || '',
              } as DayMatch}
            />
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
