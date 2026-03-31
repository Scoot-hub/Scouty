import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import {
  useOrgMatchAssignments,
  useUpdateAssignment,
  useRemoveMatch,
  useUpdateMatchStatus,
  type MatchAssignment,
} from '@/hooks/use-match-assignments';
import { useCurrentOrg, useOrganizationMembers } from '@/hooks/use-organization';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, Trash2,
  UserCircle, CheckCircle2, Circle, XCircle, Route,
} from 'lucide-react';
import { useUtcOffset, formatTimeWithOffset } from '@/hooks/use-utc-offset';
import { cn } from '@/lib/utils';

const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  confirmed: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
  cancelled: 'bg-muted text-muted-foreground',
};

const STATUS_DOT: Record<string, string> = {
  planned: 'bg-blue-500',
  confirmed: 'bg-amber-500',
  completed: 'bg-green-500',
  cancelled: 'bg-muted-foreground',
};

function getMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();

  const cells: { date: string; day: number; inMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    const d = prevDays - i;
    const prev = new Date(year, month - 1, d);
    cells.push({ date: fmt(prev), day: d, inMonth: false });
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: fmt(new Date(year, month, d)), day: d, inMonth: true });
  }
  // Next month padding (fill to 42 = 6 rows)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const next = new Date(year, month + 1, d);
    cells.push({ date: fmt(next), day: d, inMonth: false });
  }
  return cells;
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function OrgRoadmap() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const { data: members } = useOrganizationMembers(org?.id);
  const { data: assignments, isLoading } = useOrgMatchAssignments(org?.id);
  const updateAssignment = useUpdateAssignment();
  const updateStatus = useUpdateMatchStatus();
  const removeMatch = useRemoveMatch();

  const { utcOffset } = useUtcOffset();
  const [filterScout, setFilterScout] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const myRole = org?.myRole;
  const isAdminOrOwner = myRole === 'owner' || myRole === 'admin';

  const membersMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members ?? []) {
      map.set(m.user_id, m.profile?.full_name || t('org.unknown_user'));
    }
    return map;
  }, [members, t]);

  const todayStr = fmt(new Date());

  const filtered = useMemo(() => {
    let list = assignments ?? [];
    if (filterScout !== 'all') {
      if (filterScout === 'unassigned') {
        list = list.filter(m => !m.assigned_to);
      } else {
        list = list.filter(m => m.assigned_to === filterScout);
      }
    }
    return list;
  }, [assignments, filterScout]);

  // Map date → matches for calendar
  const matchesByDate = useMemo(() => {
    const map = new Map<string, MatchAssignment[]>();
    for (const m of filtered) {
      const dateKey = m.match_date.slice(0, 10);
      const arr = map.get(dateKey) ?? [];
      arr.push(m);
      map.set(dateKey, arr);
    }
    return map;
  }, [filtered]);

  const calendarCells = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });

  const dayNames = useMemo(() => {
    const base = new Date(2024, 0, 1); // Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString(i18n.language, { weekday: 'short' });
    });
  }, [i18n.language]);

  const goToPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goToNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const goToToday = () => {
    const n = new Date();
    setViewYear(n.getFullYear());
    setViewMonth(n.getMonth());
    setSelectedDate(todayStr);
  };

  const handleCycleStatus = (m: MatchAssignment) => {
    const cycle: Record<string, string> = { planned: 'confirmed', confirmed: 'completed', completed: 'planned', cancelled: 'planned' };
    updateStatus.mutate({ id: m.id, status: cycle[m.status] ?? 'planned' });
  };

  const handleAssign = (id: string, userId: string | null) => {
    updateAssignment.mutate({ id, assigned_to: userId }, {
      onSuccess: () => toast({ title: t('roadmap.assignment_updated') }),
    });
  };

  const handleRemove = (id: string) => {
    removeMatch.mutate(id, { onSuccess: () => toast({ title: t('roadmap.removed') }) });
  };

  // Matches for the selected day panel
  const selectedDayMatches = selectedDate ? (matchesByDate.get(selectedDate) ?? []) : [];

  if (orgLoading) return (
    <div className="flex items-center justify-center min-h-[40vh] gap-2">
      <Loader2 className="w-5 h-5 animate-spin text-primary" />
    </div>
  );

  if (!org) return (
    <div className="text-center py-20">
      <p className="text-lg font-semibold text-muted-foreground">{t('org.not_found')}</p>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Route className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('roadmap.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('roadmap.subtitle', { name: org.name, count: assignments?.length ?? 0 })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterScout} onValueChange={setFilterScout}>
            <SelectTrigger className="w-[200px] rounded-xl h-9 text-sm">
              <SelectValue placeholder={t('roadmap.filter_scout')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('roadmap.all_scouts')}</SelectItem>
              <SelectItem value="unassigned">{t('roadmap.unassigned')}</SelectItem>
              {(members ?? []).map((m: any) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name || t('org.unknown_user')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[30vh] gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
          {/* Calendar */}
          <Card>
            <CardContent className="p-4">
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="rounded-xl h-8 w-8" onClick={goToPrev}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-xl text-xs px-3 h-8" onClick={goToToday}>
                    {t('common.today')}
                  </Button>
                  <Button variant="outline" size="icon" className="rounded-xl h-8 w-8" onClick={goToNext}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <h2 className="text-lg font-bold capitalize">{monthLabel}</h2>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {dayNames.map(d => (
                  <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {calendarCells.map((cell, i) => {
                  const dayMatches = matchesByDate.get(cell.date) ?? [];
                  const isToday = cell.date === todayStr;
                  const isSelected = cell.date === selectedDate;
                  const hasMatches = dayMatches.length > 0;

                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedDate(cell.date === selectedDate ? null : cell.date)}
                      className={cn(
                        'relative flex flex-col items-center py-2 px-1 min-h-[64px] border border-transparent rounded-lg transition-all text-sm',
                        !cell.inMonth && 'opacity-30',
                        cell.inMonth && 'hover:bg-muted/50',
                        isToday && 'bg-primary/5',
                        isSelected && 'ring-2 ring-primary bg-primary/10',
                        hasMatches && cell.inMonth && 'cursor-pointer',
                      )}
                    >
                      <span className={cn(
                        'w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold',
                        isToday && !isSelected && 'bg-primary text-primary-foreground',
                        isSelected && 'bg-primary text-primary-foreground',
                      )}>
                        {cell.day}
                      </span>
                      {/* Match dots */}
                      {hasMatches && (
                        <div className="flex items-center gap-0.5 mt-1 flex-wrap justify-center max-w-full">
                          {dayMatches.slice(0, 3).map((m, j) => (
                            <span key={j} className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT[m.status] ?? 'bg-muted-foreground')} />
                          ))}
                          {dayMatches.length > 3 && (
                            <span className="text-[8px] text-muted-foreground font-bold ml-0.5">+{dayMatches.length - 3}</span>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Day detail panel */}
          <div className="space-y-3">
            {selectedDate ? (
              <>
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold capitalize">
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedDayMatches.length} {t('fixtures.matches')}
                  </span>
                </div>
                {selectedDayMatches.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">{t('roadmap.empty')}</p>
                ) : (
                  <div className="space-y-2.5">
                    {selectedDayMatches.map(m => (
                      <OrgMatchCard
                        key={m.id}
                        match={m}
                        membersMap={membersMap}
                        members={members ?? []}
                        isAdminOrOwner={isAdminOrOwner}
                        onAssign={handleAssign}
                        onCycleStatus={() => handleCycleStatus(m)}
                        onRemove={() => handleRemove(m.id)}
                        t={t}
                        utcOffset={utcOffset}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <CalendarDays className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{t('roadmap.select_day')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrgMatchCard({ match, membersMap, members, isAdminOrOwner, onAssign, onCycleStatus, onRemove, t, utcOffset }: {
  match: MatchAssignment;
  membersMap: Map<string, string>;
  members: any[];
  isAdminOrOwner: boolean;
  onAssign: (id: string, userId: string | null) => void;
  onCycleStatus: () => void;
  onRemove: () => void;
  t: (key: string, opts?: any) => string;
  utcOffset: number;
}) {
  const assignedName = match.assigned_to ? membersMap.get(match.assigned_to) : null;

  return (
    <Card className="overflow-hidden transition-all duration-200 hover:scale-[1.005]">
      <CardContent className="p-3.5">
        {/* Top row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {match.competition && (
              <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-[160px]">
                {match.competition}
              </span>
            )}
            {match.match_time && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatTimeWithOffset(match.match_time, utcOffset)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn(
              'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider cursor-pointer',
              STATUS_COLORS[match.status] ?? 'bg-muted text-muted-foreground',
            )} onClick={isAdminOrOwner ? onCycleStatus : undefined}>
              {t(`my_matches.status_${match.status}`)}
            </span>
            {isAdminOrOwner && (
              <button onClick={onRemove} className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-2 mb-2.5">
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <p className="font-semibold text-sm truncate text-right">{match.home_team}</p>
            {match.home_badge && (
              <img src={match.home_badge} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
            )}
          </div>
          <span className="shrink-0 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">VS</span>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {match.away_badge && (
              <img src={match.away_badge} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
            )}
            <p className="font-semibold text-sm truncate">{match.away_team}</p>
          </div>
        </div>

        {/* Assignment row */}
        <div className="pt-2 border-t flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <UserCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {isAdminOrOwner ? (
              <Select
                value={match.assigned_to ?? 'none'}
                onValueChange={v => onAssign(match.id, v === 'none' ? null : v)}
              >
                <SelectTrigger className="h-7 text-xs rounded-lg w-[160px]">
                  <SelectValue placeholder={t('roadmap.assign_scout')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('roadmap.unassigned')}</SelectItem>
                  {members.map((m: any) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name || m.email || t('org.unknown_user')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs font-medium">
                {assignedName ?? t('roadmap.unassigned')}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
