import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useMyMatches, useRemoveMatch, useUpdateMatchStatus, type MatchAssignment } from '@/hooks/use-match-assignments';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarDays, Clock, Loader2, MapPin, Search, Trash2, CheckCircle2, Circle, XCircle, ChevronRight,
} from 'lucide-react';
import { useUtcOffset, formatTimeWithOffset } from '@/hooks/use-utc-offset';
import { cn } from '@/lib/utils';

const STATUS_ICONS: Record<string, typeof Circle> = {
  planned: Circle,
  confirmed: CheckCircle2,
  completed: CheckCircle2,
  cancelled: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  planned: 'text-blue-500',
  confirmed: 'text-amber-500',
  completed: 'text-green-500',
  cancelled: 'text-muted-foreground',
};

function formatDateFull(dateStr: string, locale?: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function MyMatches() {
  const { t, i18n } = useTranslation();
  const { data: matches, isLoading } = useMyMatches();
  const removeMatch = useRemoveMatch();
  const updateStatus = useUpdateMatchStatus();
  const { toast } = useToast();
  const { utcOffset } = useUtcOffset();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past'>('all');

  const todayStr = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    let list = matches ?? [];
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(m =>
        m.home_team.toLowerCase().includes(q) ||
        m.away_team.toLowerCase().includes(q) ||
        m.competition.toLowerCase().includes(q)
      );
    }
    if (filter === 'upcoming') list = list.filter(m => m.match_date >= todayStr);
    if (filter === 'past') list = list.filter(m => m.match_date < todayStr);
    return list;
  }, [matches, search, filter, todayStr]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, MatchAssignment[]>();
    for (const m of filtered) {
      const arr = map.get(m.match_date) ?? [];
      arr.push(m);
      map.set(m.match_date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const handleCycleStatus = (m: MatchAssignment) => {
    const cycle: Record<string, string> = { planned: 'confirmed', confirmed: 'completed', completed: 'planned', cancelled: 'planned' };
    updateStatus.mutate({ id: m.id, status: cycle[m.status] ?? 'planned' });
  };

  const handleRemove = (id: string) => {
    removeMatch.mutate(id, { onSuccess: () => toast({ title: t('my_matches.removed') }) });
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('my_matches.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('my_matches.subtitle', { count: matches?.length ?? 0 })}
            </p>
          </div>
        </div>
        <Link to="/fixtures">
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
            <CalendarDays className="w-4 h-4" />
            {t('my_matches.go_to_fixtures')}
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {(['all', 'upcoming', 'past'] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              className="rounded-xl text-xs px-4"
              onClick={() => setFilter(f)}
            >
              {t(`my_matches.filter_${f}`)}
            </Button>
          ))}
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('fixtures.search_placeholder_team')}
            className="rounded-xl pl-9 h-9 text-sm"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center min-h-[30vh] gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">📋</p>
          <p className="text-lg font-semibold text-muted-foreground">{t('my_matches.empty')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('my_matches.empty_desc')}</p>
          <Link to="/fixtures" className="mt-4 inline-block">
            <Button variant="outline" size="sm" className="rounded-xl">
              {t('my_matches.go_to_fixtures')}
            </Button>
          </Link>
        </div>
      )}

      {/* Matches grouped by date */}
      {!isLoading && grouped.length > 0 && (
        <div className="space-y-6">
          {grouped.map(([date, dayMatches]) => {
            const isToday = date === todayStr;
            const isPast = date < todayStr;
            return (
              <div key={date}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn(
                    'px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider',
                    isToday ? 'bg-primary/10 text-primary' : isPast ? 'bg-muted text-muted-foreground' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                  )}>
                    {isToday ? t('common.today') : formatDateFull(date, i18n.language)}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {dayMatches.length} {t('fixtures.matches')}
                  </span>
                </div>
                <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {dayMatches.map(m => (
                    <MatchCard key={m.id} match={m} onCycleStatus={() => handleCycleStatus(m)} onRemove={() => handleRemove(m.id)} t={t} utcOffset={utcOffset} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, onCycleStatus, onRemove, t, utcOffset }: {
  match: MatchAssignment;
  onCycleStatus: () => void;
  onRemove: () => void;
  t: (key: string, opts?: any) => string;
  utcOffset: number;
}) {
  const StatusIcon = STATUS_ICONS[match.status] ?? Circle;
  const statusColor = STATUS_COLORS[match.status] ?? 'text-muted-foreground';

  return (
    <Card className="overflow-hidden transition-all duration-200 hover:scale-[1.01]">
      <CardContent className="p-3.5">
        {/* Top row: competition + status + actions */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {match.competition && (
              <span className="text-[10px] font-semibold text-muted-foreground truncate max-w-[160px]">
                {match.competition}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {match.match_time && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatTimeWithOffset(match.match_time, utcOffset)}
              </span>
            )}
            <button
              onClick={onCycleStatus}
              className={cn('p-1 rounded-md transition-colors hover:bg-muted', statusColor)}
              title={t(`my_matches.status_${match.status}`)}
            >
              <StatusIcon className="w-4 h-4" />
            </button>
            <button onClick={onRemove} className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Teams */}
        <div className="flex items-center gap-2.5">
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <p className="font-semibold text-sm truncate text-right">{match.home_team}</p>
            {match.home_badge && (
              <img src={match.home_badge} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
            )}
          </div>
          <span className="shrink-0 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">VS</span>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {match.away_badge && (
              <img src={match.away_badge} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
            )}
            <p className="font-semibold text-sm truncate">{match.away_team}</p>
          </div>
        </div>

        {/* Status pill */}
        <div className="mt-2 flex items-center gap-2">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
            match.status === 'planned' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            match.status === 'confirmed' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
            match.status === 'completed' && 'bg-green-500/10 text-green-600 dark:text-green-400',
            match.status === 'cancelled' && 'bg-muted text-muted-foreground',
          )}>
            {t(`my_matches.status_${match.status}`)}
          </span>
          {match.notes && (
            <span className="text-[10px] text-muted-foreground truncate">{match.notes}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
