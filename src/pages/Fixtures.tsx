import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useEventsForDay,
  useAllEventsForDay,
  type LivescoreEvent,
  type LivescoreCompetition,
} from '@/hooks/use-api-football';
import { usePlayers } from '@/hooks/use-players';
import { useSaveMatch, useMyMatches, useAssignMatch } from '@/hooks/use-match-assignments';
import { useMyOrganizations, useOrganizationMembers } from '@/hooks/use-organization';
import type { Player } from '@/types/player';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, CalendarDays, ChevronLeft, ChevronRight,
  Clock, Globe, Loader2, Search, Star, Plus, Check, UserCircle,
} from 'lucide-react';
import { useUtcOffset, formatTimeWithOffset } from '@/hooks/use-utc-offset';
import { cn } from '@/lib/utils';

function getDateString(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function formatDateFull(dateStr: string, locale?: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Country code → flag emoji
function countryFlag(code: string) {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}

function isLive(status: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  if (s === 'HT' || s === '1H' || s === '2H' || s === 'ET' || s === 'LIVE') return true;
  // Numeric minute like "45", "67+2"
  return /^\d/.test(status);
}

function isFinished(status: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'FT' || s === 'AET' || s === 'AP' || s === 'PEN';
}

// Priority: 0 = live, 1 = upcoming within 1h, 2 = other scheduled, 3 = finished
function getEventPriority(event: LivescoreEvent): number {
  if (isLive(event.status)) return 0;
  if (isFinished(event.status)) return 3;
  if (!event.match_time) return 2;
  const now = new Date();
  const [h, m] = event.match_time.split(':').map(Number);
  const matchUTC = h * 60 + m;
  const nowUTC = now.getUTCHours() * 60 + now.getUTCMinutes();
  const diff = matchUTC - nowUTC;
  if (diff >= 0 && diff <= 60) return 1; // starts within 1h
  return 2;
}

function getCompPriority(comp: LivescoreCompetition): number {
  return Math.min(...comp.events.map(getEventPriority));
}

// Normalize a club/team name for comparison: remove diacritics, lowercase, strip common prefixes/suffixes
function normalizeTeamName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip common football prefixes/suffixes for a secondary comparison
function stripPrefixes(norm: string): string {
  return norm
    .replace(/\b(fc|cf|sc|ac|as|us|rc|og|ss|ssc|afc|bsc|fk|sk|sv|vfb|vfl|tsv|rb|1\.)(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Common abbreviations found in livescore feeds
const ABBREVIATIONS: Record<string, string> = {
  utd: 'united', cty: 'city', ath: 'athletic', athl: 'athletic',
  sp: 'sporting', int: 'inter', intl: 'internacional',
  oly: 'olympique', dep: 'deportivo',
};

function expandAbbreviations(norm: string): string {
  return norm.split(' ').map(w => ABBREVIATIONS[w] ?? w).join(' ');
}

// Detect reserve / B-team / youth team names
function isReserveTeam(name: string): boolean {
  const norm = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Suffix: "... B", "... II", "... III", "... 2", "... U23", "... Castilla", "... Atletic", etc.
  if (/\s(b|ii|iii|2|3|u\d{2}|castilla|atletic|primavera|juvenil|reserves?|youth|amateur|cantera)\s*$/.test(norm)) return true;
  // Prefix: "Jong ...", "Jeunesse ..."
  if (/^(jong|jeunesse)\s/.test(norm)) return true;
  return false;
}

// Strict check: does the player's current club match this team name?
function clubMatchesTeam(playerClub: string, teamName: string): boolean {
  // Guard: never match a first team with a reserve/B/youth team
  if (isReserveTeam(playerClub) !== isReserveTeam(teamName)) return false;

  const normClub = normalizeTeamName(playerClub);
  const normTeam = normalizeTeamName(teamName);
  if (!normClub || !normTeam || normClub.length < 3 || normTeam.length < 3) return false;

  // 1. Exact normalized match
  if (normClub === normTeam) return true;

  // 2. Exact match after stripping prefixes (e.g. "FC Barcelona" vs "Barcelona")
  const strippedClub = stripPrefixes(normClub);
  const strippedTeam = stripPrefixes(normTeam);
  if (strippedClub && strippedTeam && strippedClub === strippedTeam) return true;

  // 3. Exact match after expanding abbreviations (e.g. "Manchester Utd" vs "Manchester United")
  const expandedClub = expandAbbreviations(strippedClub);
  const expandedTeam = expandAbbreviations(strippedTeam);
  if (expandedClub === expandedTeam) return true;

  // 4. Match after stripping prefixes from expanded forms
  if (stripPrefixes(expandedClub) === stripPrefixes(expandedTeam)) return true;

  return false;
}

// Detect whether a competition or league name refers to women's football
const WOMEN_RE = /\b(women|woman|feminin|feminine|femenin|femenina|femenil|damen|frauen|femmes|wsl|nwsl|w\s*league|girls|lady|ladies)\b|(\bw\b)$/i;
function isWomen(name: string): boolean {
  return WOMEN_RE.test(
    name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  );
}

interface MyPlayerMatch {
  event: LivescoreEvent;
  competition: LivescoreCompetition;
  players: Player[];
  side: 'home' | 'away' | 'both';
}

export default function Fixtures() {
  const { t, i18n } = useTranslation();
  const [dayOffset, setDayOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { utcOffset, setUtcOffset, getLocalUtcOffset } = useUtcOffset();
  const [utcOpen, setUtcOpen] = useState(false);
  const selectedDate = useMemo(() => getDateString(dayOffset), [dayOffset]);
  const { toast } = useToast();

  const PAGE_SIZE = 20;
  const [eventsOffset, setEventsOffset] = useState(0);
  const [allCompetitions, setAllCompetitions] = useState<LivescoreCompetition[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const { data, isLoading, isFetching } = useEventsForDay(selectedDate, PAGE_SIZE, eventsOffset);
  // Fetch all events in parallel (no pagination) to compute "my players" matches exhaustively
  const { data: allEventsData } = useAllEventsForDay(selectedDate);

  // Reset when date changes
  useMemo(() => { setEventsOffset(0); setAllCompetitions([]); setTotalCount(0); setHasMore(false); }, [selectedDate]);

  // Merge new page into accumulated competitions
  useMemo(() => {
    if (!data?.competitions) return;
    setTotalCount(data.count ?? 0);
    setHasMore((data.returned ?? data.competitions.reduce((s, c) => s + c.events.length, 0)) >= PAGE_SIZE);
    if (eventsOffset === 0) {
      setAllCompetitions(data.competitions);
    } else {
      setAllCompetitions(prev => {
        const merged = [...prev];
        for (const newComp of data.competitions) {
          const existing = merged.find(c => c.name === newComp.name && c.country_code === newComp.country_code);
          if (existing) {
            const existingIds = new Set(existing.events.map(e => e.id));
            existing.events.push(...newComp.events.filter(e => !existingIds.has(e.id)));
          } else {
            merged.push(newComp);
          }
        }
        return merged;
      });
    }
  }, [data]);

  const competitions = allCompetitions;
  const loadMore = () => setEventsOffset(prev => prev + PAGE_SIZE);

  // My saved matches (to show "already saved" state)
  const { data: myMatches } = useMyMatches();
  const saveMatch = useSaveMatch();
  const assignMatch = useAssignMatch();
  const { data: myOrgs } = useMyOrganizations();
  const savedMatchKeys = useMemo(() => {
    const set = new Set<string>();
    for (const m of myMatches ?? []) {
      set.add(`${m.match_date}|${m.home_team}|${m.away_team}`);
    }
    return set;
  }, [myMatches]);

  const handleSaveMatch = (ev: LivescoreEvent, competition: string) => {
    const key = `${selectedDate}|${ev.home_team}|${ev.away_team}`;
    if (savedMatchKeys.has(key)) return;
    saveMatch.mutate({
      home_team: ev.home_team,
      away_team: ev.away_team,
      match_date: selectedDate,
      match_time: ev.match_time ?? null,
      competition,
      home_badge: ev.home_badge ?? null,
      away_badge: ev.away_badge ?? null,
    }, {
      onSuccess: () => toast({ title: t('my_matches.saved') }),
    });
  };

  const handleSaveToOrg = (ev: LivescoreEvent, competition: string, orgId: string, userId?: string) => {
    assignMatch.mutate({
      home_team: ev.home_team,
      away_team: ev.away_team,
      match_date: selectedDate,
      match_time: ev.match_time ?? null,
      competition,
      home_badge: ev.home_badge ?? null,
      away_badge: ev.away_badge ?? null,
      organization_id: orgId,
      assigned_to: userId || '',
    }, {
      onSuccess: () => toast({ title: t('roadmap.added_to_roadmap') }),
    });
  };

  // Filter by search (team name or competition)
  const filtered = useMemo(() => {
    if (!search.trim()) return competitions;
    const q = search.toLowerCase().trim();
    const result: LivescoreCompetition[] = [];
    for (const comp of competitions) {
      if (comp.name.toLowerCase().includes(q) || comp.country.toLowerCase().includes(q)) {
        result.push(comp);
        continue;
      }
      const matchingEvents = comp.events.filter(
        ev => ev.home_team.toLowerCase().includes(q) || ev.away_team.toLowerCase().includes(q)
      );
      if (matchingEvents.length > 0) {
        result.push({ ...comp, events: matchingEvents });
      }
    }
    return result;
  }, [competitions, search]);

  // ── My players matching ──
  const { data: playersData } = usePlayers();

  const myPlayerMatches = useMemo(() => {
    const allCompetitionsForPlayers = allEventsData?.competitions ?? [];
    if (!playersData?.length || !allCompetitionsForPlayers.length) return [];
    // Build a map of unique clubs → players
    const clubPlayersMap = new Map<string, Player[]>();
    for (const p of playersData) {
      if (!p.club) continue;
      const existing = clubPlayersMap.get(p.club) ?? [];
      existing.push(p);
      clubPlayersMap.set(p.club, existing);
    }
    if (clubPlayersMap.size === 0) return [];

    const matches: MyPlayerMatch[] = [];
    const seenEventIds = new Set<string>();

    for (const comp of allCompetitionsForPlayers) {
      const compIsWomen = isWomen(comp.name);
      for (const ev of comp.events) {
        if (seenEventIds.has(ev.id)) continue;
        const homePlayers: Player[] = [];
        const awayPlayers: Player[] = [];
        for (const [club, players] of clubPlayersMap) {
          // Filter players whose league gender matches the competition gender
          const genderMatched = players.filter(p => isWomen(p.league ?? '') === compIsWomen);
          if (genderMatched.length === 0) continue;
          if (clubMatchesTeam(club, ev.home_team)) homePlayers.push(...genderMatched);
          if (clubMatchesTeam(club, ev.away_team)) awayPlayers.push(...genderMatched);
        }
        if (homePlayers.length > 0 || awayPlayers.length > 0) {
          seenEventIds.add(ev.id);
          const allPlayers = [...homePlayers, ...awayPlayers];
          // Deduplicate players by id
          const uniquePlayers = Array.from(new Map(allPlayers.map(p => [p.id, p])).values());
          matches.push({
            event: ev,
            competition: comp,
            players: uniquePlayers,
            side: homePlayers.length > 0 && awayPlayers.length > 0 ? 'both'
              : homePlayers.length > 0 ? 'home' : 'away',
          });
        }
      }
    }
    return matches;
  }, [playersData, allEventsData]);

  // Filter myPlayerMatches by search too
  const filteredMyPlayerMatches = useMemo(() => {
    if (!search.trim()) return myPlayerMatches;
    const q = search.toLowerCase().trim();
    return myPlayerMatches.filter(m =>
      m.event.home_team.toLowerCase().includes(q) ||
      m.event.away_team.toLowerCase().includes(q) ||
      m.competition.name.toLowerCase().includes(q) ||
      m.players.some(p => p.name.toLowerCase().includes(q))
    );
  }, [myPlayerMatches, search]);

  // Sort: competitions with live / upcoming-within-1h matches first, events sorted by priority inside each comp
  const sortedFiltered = useMemo(() => {
    return [...filtered]
      .map(comp => ({
        ...comp,
        events: [...comp.events].sort((a, b) => getEventPriority(a) - getEventPriority(b)),
      }))
      .sort((a, b) => getCompPriority(a) - getCompPriority(b));
  }, [filtered]);

  const filteredCount = sortedFiltered.reduce((sum, c) => sum + c.events.length, 0);

  const displayedCount = sortedFiltered.reduce((sum, c) => sum + c.events.length, 0);
  const hasSearch = !!search.trim();
  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = selectedDate === todayStr;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('fixtures.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {totalCount > 0
                ? t('fixtures.subtitle_day', { count: totalCount })
                : t('fixtures.title')}
            </p>
          </div>
        </div>
      </div>

      {/* Day navigation + search */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="rounded-xl h-9 w-9" onClick={() => setDayOffset(d => d - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant={isToday ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl text-xs px-4"
            onClick={() => setDayOffset(0)}
          >
            {t('common.today')}
          </Button>
          <Button variant="outline" size="icon" className="rounded-xl h-9 w-9" onClick={() => setDayOffset(d => d + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 ml-1 px-2 py-1 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                <CalendarDays className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold capitalize">
                  {formatDateFull(selectedDate, i18n.language)}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={new Date(selectedDate + 'T00:00:00')}
                onSelect={(date) => {
                  if (date) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const diffMs = date.getTime() - today.getTime();
                    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                    setDayOffset(diffDays);
                  }
                  setCalendarOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {isFetching && !isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Search + UTC selector */}
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('fixtures.search_placeholder_team')}
              className="rounded-xl pl-9 h-9 text-sm"
            />
          </div>
          <Popover open={utcOpen} onOpenChange={setUtcOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl h-9 text-xs gap-1.5 px-3 shrink-0">
                <Globe className="w-3.5 h-3.5" />
                UTC{utcOffset >= 0 ? '+' : ''}{utcOffset}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2 max-h-64 overflow-y-auto" align="end">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                {t('fixtures.timezone')}
              </p>
              <div className="space-y-0.5">
                {Array.from({ length: 25 }, (_, i) => i - 12).map(offset => (
                  <button
                    key={offset}
                    onClick={() => { setUtcOffset(offset); setUtcOpen(false); }}
                    className={cn(
                      'w-full text-left px-2 py-1 rounded-md text-xs font-medium transition-colors',
                      offset === utcOffset
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    UTC{offset >= 0 ? '+' : ''}{offset}
                    {offset === getLocalUtcOffset() && (
                      <span className="text-[10px] ml-1 opacity-60">({t('fixtures.local')})</span>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[30vh] gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredCount === 0 && (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">{search ? '🔍' : '📅'}</p>
          <p className="text-lg font-semibold text-muted-foreground">
            {search ? t('fixtures.no_search_results') : t('fixtures.empty_day')}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {search ? t('fixtures.no_search_results_desc') : t('fixtures.empty_day_desc')}
          </p>
        </div>
      )}

      {/* When searching: competitions first, then My Players below.
          Otherwise: My Players first, then competitions. */}

      {/* ── My Players section (before competitions when no search) ── */}
      {!isLoading && !hasSearch && filteredMyPlayerMatches.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 fill-current" />
              {t('fixtures.my_players_section')}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {filteredMyPlayerMatches.length} {t('fixtures.matches')}
            </span>
          </div>
          <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filteredMyPlayerMatches.map(m => (
              <MyPlayerEventCard key={m.event.id} match={m} t={t} onSave={handleSaveMatch} onSaveToOrg={handleSaveToOrg} orgs={myOrgs ?? []} isSaved={savedMatchKeys.has(`${selectedDate}|${m.event.home_team}|${m.event.away_team}`)} utcOffset={utcOffset} selectedDate={selectedDate} />
            ))}
          </div>
        </div>
      )}

      {/* Competitions & events */}
      {!isLoading && sortedFiltered.length > 0 && (
        <div className="space-y-5">
          {sortedFiltered.map(comp => (
            <CompetitionGroup key={`${comp.country_code}-${comp.name}`} competition={comp} t={t} onSave={handleSaveMatch} onSaveToOrg={handleSaveToOrg} orgs={myOrgs ?? []} savedMatchKeys={savedMatchKeys} selectedDate={selectedDate} utcOffset={utcOffset} />
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={isFetching}
                className="rounded-xl"
              >
                {isFetching
                  ? t('common.loading')
                  : t('fixtures.show_more', { shown: displayedCount, total: totalCount })}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── My Players section (after competitions when searching) ── */}
      {!isLoading && hasSearch && filteredMyPlayerMatches.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 fill-current" />
              {t('fixtures.my_players_section')}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {filteredMyPlayerMatches.length} {t('fixtures.matches')}
            </span>
          </div>
          <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filteredMyPlayerMatches.map(m => (
              <MyPlayerEventCard key={m.event.id} match={m} t={t} onSave={handleSaveMatch} onSaveToOrg={handleSaveToOrg} orgs={myOrgs ?? []} isSaved={savedMatchKeys.has(`${selectedDate}|${m.event.home_team}|${m.event.away_team}`)} utcOffset={utcOffset} selectedDate={selectedDate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Competition Group ── */
interface OrgItem { id: string; name: string; [key: string]: unknown }
interface OrgMember { user_id: string; role?: string; profile?: { full_name?: string } }

function CompetitionGroup({ competition, t, onSave, onSaveToOrg, orgs, savedMatchKeys, selectedDate, utcOffset }: { competition: LivescoreCompetition; t: (key: string) => string; onSave: (ev: LivescoreEvent, competition: string) => void; onSaveToOrg: (ev: LivescoreEvent, competition: string, orgId: string, userId?: string) => void; orgs: OrgItem[]; savedMatchKeys: Set<string>; selectedDate: string; utcOffset: number }) {
  const flag = countryFlag(competition.country_code);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {flag && <span className="text-base">{flag}</span>}
        <div className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-muted text-muted-foreground">
          {competition.name}
        </div>
        {competition.country && (
          <span className="text-[11px] text-muted-foreground">{competition.country}</span>
        )}
        <span className="text-[11px] text-muted-foreground/60">
          {competition.events.length} {t('fixtures.matches')}
        </span>
      </div>
      <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {competition.events.map(ev => (
          <EventCard key={ev.id} event={ev} onSave={() => onSave(ev, competition.name)} onSaveToOrg={(orgId: string, userId?: string) => onSaveToOrg(ev, competition.name, orgId, userId)} orgs={orgs} isSaved={savedMatchKeys.has(`${selectedDate}|${ev.home_team}|${ev.away_team}`)} utcOffset={utcOffset} selectedDate={selectedDate} competition={competition.name} />
        ))}
      </div>
    </div>
  );
}

/* ── My Player Event Card (highlighted) ── */
function MyPlayerEventCard({ match, t, onSave, onSaveToOrg, orgs, isSaved, utcOffset, selectedDate }: { match: MyPlayerMatch; t: (key: string) => string; onSave: (ev: LivescoreEvent, competition: string) => void; onSaveToOrg: (ev: LivescoreEvent, competition: string, orgId: string, userId?: string) => void; orgs: OrgItem[]; isSaved: boolean; utcOffset: number; selectedDate: string }) {
  const navigate = useNavigate();
  const { event, competition, players } = match;
  const hasScore = event.score_home !== null && event.score_away !== null;
  const live = isLive(event.status);
  const finished = isFinished(event.status);
  const flag = countryFlag(competition.country_code);

  const goToDetail = () => {
    if (!event.id) return;
    const params = new URLSearchParams({
      home: event.home_team,
      away: event.away_team,
      competition: competition.name,
      date: selectedDate,
    });
    navigate(`/match/${event.id}?${params}`);
  };

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all duration-200 hover:scale-[1.01] ring-2 ring-amber-500/40 bg-amber-500/[0.04] cursor-pointer',
        live && 'ring-green-500/50 bg-green-500/[0.03]',
      )}
      onClick={goToDetail}
    >
      <div className={cn(
        'absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r',
        live ? 'from-green-500 to-green-400' : 'from-amber-500 to-amber-400',
      )} />
      <CardContent className="p-3.5">
        {/* Competition + Time / Status row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {flag && <span className="text-xs">{flag}</span>}
            <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-[140px]">
              {competition.name}
            </span>
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {event.match_time && !live && !finished && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatTimeWithOffset(event.match_time, utcOffset)}
              </span>
            )}
            {live && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 dark:text-green-400 animate-pulse">
                {event.status === 'HT' ? 'HT' : `${event.status}'`}
              </span>
            )}
            {finished && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
                {event.status}
              </span>
            )}
            <SaveMatchButton
              isSaved={isSaved}
              onSave={() => onSave(event, competition.name)}
              onSaveToOrg={(orgId, userId) => onSaveToOrg(event, competition.name, orgId, userId)}
              orgs={orgs}
              t={t}
            />
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="font-semibold text-sm truncate text-right">{event.home_team}</span>
            {event.home_badge && (
              <img src={event.home_badge} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
            )}
          </div>
          <div className="shrink-0 w-14 text-center">
            {hasScore ? (
              <span className={cn(
                'text-lg font-extrabold font-mono',
                live && 'text-green-600 dark:text-green-400',
              )}>
                {event.score_home}-{event.score_away}
              </span>
            ) : (
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {formatTimeWithOffset(event.match_time, utcOffset) || 'VS'}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {event.away_badge && (
              <img src={event.away_badge} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
            )}
            <span className="font-semibold text-sm truncate">{event.away_team}</span>
          </div>
        </div>

        {/* Players involved */}
        <div className="mt-2.5 pt-2 border-t border-amber-500/20 flex items-center gap-2 flex-wrap">
          {players.slice(0, 4).map(p => (
            <Link key={p.id} to={`/player/${p.id}`} className="flex items-center gap-1.5 hover:bg-muted/50 rounded-md px-1 -mx-1 py-0.5 transition-colors" onClick={e => e.stopPropagation()}>
              <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" className="!w-6 !h-6 !text-[8px] !rounded-md" />
              <span className="text-[11px] font-medium truncate max-w-[100px] hover:underline">{p.name}</span>
            </Link>
          ))}
          {players.length > 4 && (
            <span className="text-[10px] text-muted-foreground">+{players.length - 4}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Org row with hover flyout showing members ── */
function OrgRowWithMembers({ org, onSaveToOrg, t }: {
  org: OrgItem;
  onSaveToOrg: (orgId: string, userId?: string) => void;
  t: (key: string) => string;
}) {
  const [hovered, setHovered] = useState(false);
  const { data: members, isLoading } = useOrganizationMembers(hovered ? org.id : undefined);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={() => onSaveToOrg(org.id)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-muted transition-colors text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate">{org.name}</span>
        </span>
        <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
      </button>

      {/* Flyout sub-menu on hover */}
      {hovered && (
        <div className="absolute right-full top-0 mr-1 z-50 min-w-[180px] rounded-lg border bg-popover p-1.5 shadow-md">
          <p className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t('roadmap.assign_scout')}
          </p>
          <button
            onClick={() => onSaveToOrg(org.id)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-muted transition-colors text-left"
          >
            <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            {t('roadmap.unassigned')}
          </button>
          {isLoading && (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            </div>
          )}
          {members?.map((m) => {
            const member = m as OrgMember;
            return (
            <button
              key={member.user_id}
              onClick={() => onSaveToOrg(org.id, member.user_id)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-muted transition-colors text-left"
            >
              <UserCircle className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">{member.profile?.full_name || member.user_id.slice(0, 8)}</span>
              {member.role && (
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{member.role}</span>
              )}
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Save Match Button (personal + org options) ── */
function SaveMatchButton({ isSaved, onSave, onSaveToOrg, orgs, t }: {
  isSaved: boolean;
  onSave: () => void;
  onSaveToOrg: (orgId: string, userId?: string) => void;
  orgs: OrgItem[];
  t: (key: string) => string;
}) {
  // No orgs → simple button (no popover)
  if (orgs.length === 0) {
    return (
      <button
        onClick={() => !isSaved && onSave()}
        className={cn(
          'p-1 rounded-md transition-colors',
          isSaved ? 'text-primary cursor-default' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
        )}
        title={isSaved ? t('my_matches.already_saved') : t('my_matches.save')}
      >
        {isSaved ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'p-1 rounded-md transition-colors',
            isSaved ? 'text-primary' : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
          )}
          title={t('my_matches.save')}
        >
          {isSaved ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1.5" align="end">
        <div className="space-y-0.5">
          {!isSaved && (
            <button
              onClick={onSave}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium hover:bg-muted transition-colors text-left"
            >
              <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
              {t('my_matches.save')}
            </button>
          )}
          {orgs.map((org) => (
            <OrgRowWithMembers key={org.id} org={org} onSaveToOrg={onSaveToOrg} t={t} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Event Card ── */
function EventCard({ event, onSave, onSaveToOrg, orgs, isSaved, utcOffset, selectedDate, competition }: { event: LivescoreEvent; onSave: () => void; onSaveToOrg: (orgId: string, userId?: string) => void; orgs: OrgItem[]; isSaved: boolean; utcOffset: number; selectedDate: string; competition: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasScore = event.score_home !== null && event.score_away !== null;
  const live = isLive(event.status);
  const finished = isFinished(event.status);

  const goToDetail = () => {
    if (!event.id) return;
    const params = new URLSearchParams({
      home: event.home_team,
      away: event.away_team,
      competition,
      date: selectedDate,
    });
    navigate(`/match/${event.id}?${params}`);
  };

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all duration-200 hover:scale-[1.01] cursor-pointer',
        live && 'ring-2 ring-green-500/50 bg-green-500/[0.03]',
      )}
      onClick={goToDetail}
    >
      {live && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-green-500 to-green-400" />
      )}
      <CardContent className="p-3.5">
        {/* Time / Status row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            {event.match_time && !live && !finished && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatTimeWithOffset(event.match_time, utcOffset)}
              </span>
            )}
            {live && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-green-500/10 text-green-600 dark:text-green-400 animate-pulse">
                {event.status === 'HT' ? 'HT' : `${event.status}'`}
              </span>
            )}
            {finished && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">
                {event.status}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {/* HT score if available and finished */}
            {finished && event.ht_score_home !== null && event.ht_score_away !== null && (
              <span className="text-[10px] text-muted-foreground">
                HT {event.ht_score_home}-{event.ht_score_away}
              </span>
            )}
            <SaveMatchButton
              isSaved={isSaved}
              onSave={onSave}
              onSaveToOrg={onSaveToOrg}
              orgs={orgs}
              t={t}
            />
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="font-semibold text-sm truncate text-right">{event.home_team}</span>
            {event.home_badge && (
              <img src={event.home_badge} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
            )}
          </div>
          <div className="shrink-0 w-14 text-center">
            {hasScore ? (
              <span className={cn(
                'text-lg font-extrabold font-mono',
                live && 'text-green-600 dark:text-green-400',
              )}>
                {event.score_home}-{event.score_away}
              </span>
            ) : (
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {formatTimeWithOffset(event.match_time, utcOffset) || 'VS'}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {event.away_badge && (
              <img src={event.away_badge} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
            )}
            <span className="font-semibold text-sm truncate">{event.away_team}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
