import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, MessageSquare, ListChecks, Activity, TrendingUp, Clock, Calendar, ArrowRight, Hash, User } from 'lucide-react';
import OrgTabBar from '@/components/OrgTabBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { slugify, useCurrentOrg } from '@/hooks/use-organization';

function authInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

const STATUS_META = {
  en_veille:     { label: 'En veille',     color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  a_observer:    { label: 'À observer',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  en_discussion: { label: 'En discussion', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  approche:      { label: 'Approché',      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
} as const;

const MATCH_STATUS: Record<string, { label: string; color: string }> = {
  planned:   { label: 'Planifié',   color: 'bg-blue-100 text-blue-700' },
  done:      { label: 'Effectué',   color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulé',     color: 'bg-red-100 text-red-700' },
};

interface DashboardData {
  stats: { member_count: number; shortlist_count: number; messages_30d: number; channel_count: number; upcoming_matches: number };
  activity: { id: string; type: string; title: string; message: string | null; link: string | null; created_at: string; actor_name: string; actor_photo: string | null }[];
  topMembers: { user_id: string; name: string; photo_url: string | null; msg_count: number }[];
  recentShortlist: { id: string; player_id: string; status: string; added_at: string; full_name: string; photo_url: string | null; position: string | null; club: string | null; added_by_name: string }[];
  upcomingMatches: { id: string; home_team: string; away_team: string; match_date: string; match_time: string | null; competition: string; home_badge: string | null; away_badge: string | null; status: string }[];
}

function useOrgDashboard(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-dashboard', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<DashboardData> => {
      const res = await fetch(`/api/organizations/${orgId}/dashboard`, authInit());
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  return `il y a ${Math.floor(hrs / 24)} j`;
}

function formatMatchDate(date: string, time: string | null): string {
  const d = new Date(date);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${day} · ${time}` : day;
}

export default function OrgDashboard() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const orgId = org?.id as string | undefined;
  const base = `/organization/${orgSlug}`;

  const { data, isLoading: dashLoading } = useOrgDashboard(orgId);
  const isLoading = orgLoading || dashLoading;
  if (!org && !orgLoading) return null;
  const stats = data?.stats;

  const statCards = [
    { label: 'Membres',       value: stats?.member_count ?? '—',      icon: Users,         color: 'text-blue-500',    href: `${base}/squad` },
    { label: 'Shortlist',     value: stats?.shortlist_count ?? '—',   icon: ListChecks,    color: 'text-emerald-500', href: `${base}/shortlist` },
    { label: 'Messages (30j)',value: stats?.messages_30d ?? '—',      icon: MessageSquare, color: 'text-violet-500',  href: `${base}/chat` },
    { label: 'Canaux',        value: stats?.channel_count ?? '—',     icon: Hash,          color: 'text-orange-400',  href: `${base}/chat` },
    { label: 'Matchs à venir',value: stats?.upcoming_matches ?? '—',  icon: Calendar,      color: 'text-rose-500',    href: `${base}/roadmap` },
  ];

  return (
    <div className="space-y-6">
      <OrgTabBar orgName={orgSlug ?? ''} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {statCards.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} to={href}>
            <Card className="hover:border-primary/40 transition-colors cursor-pointer h-full">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <ArrowRight className="w-3 h-3 text-muted-foreground/30" />
                </div>
                <p className="text-2xl font-extrabold tabular-nums">
                  {isLoading ? <span className="text-muted-foreground/30">…</span> : value}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="w-4 h-4 text-primary" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0.5 pt-0">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted/40 animate-pulse mb-1" />)
            ) : !data?.activity?.length ? (
              <p className="text-sm text-muted-foreground italic text-center py-6">Aucune activité récente</p>
            ) : (
              data.activity.map(item => (
                <div key={item.id} className="flex items-start gap-3 py-1.5 px-1 rounded-lg hover:bg-muted/30 transition-colors">
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarImage src={item.actor_photo ?? undefined} />
                    <AvatarFallback className="text-[10px]">{item.actor_name?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-snug line-clamp-1">{item.title}</p>
                    {item.message && <p className="text-xs text-muted-foreground line-clamp-1">{item.message}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 pt-0.5 whitespace-nowrap">{formatRelative(item.created_at)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* Recent shortlist */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2"><ListChecks className="w-4 h-4 text-primary" />Récemment shortlistés</span>
                <Link to={`${base}/shortlist`} className="text-xs text-primary hover:underline font-normal">Voir tout</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 rounded bg-muted/40 animate-pulse" />)
              ) : !data?.recentShortlist?.length ? (
                <p className="text-xs text-muted-foreground italic text-center py-3">Aucun joueur shortlisté</p>
              ) : (
                data.recentShortlist.map(entry => {
                  const meta = STATUS_META[entry.status as keyof typeof STATUS_META];
                  return (
                    <div key={entry.id} className="flex items-center gap-2">
                      <Avatar className="w-7 h-7 shrink-0">
                        <AvatarImage src={entry.photo_url ?? undefined} />
                        <AvatarFallback className="text-[10px]"><User className="w-3 h-3" /></AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{entry.full_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{entry.club ?? entry.position ?? '—'}</p>
                      </div>
                      {meta && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${meta.color}`}>{meta.label}</span>}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Upcoming matches */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm font-semibold">
                <span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />Prochains matchs</span>
                <Link to={`${base}/roadmap`} className="text-xs text-primary hover:underline font-normal">Voir tout</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 rounded bg-muted/40 animate-pulse" />)
              ) : !data?.upcomingMatches?.length ? (
                <p className="text-xs text-muted-foreground italic text-center py-3">Aucun match planifié</p>
              ) : (
                data.upcomingMatches.map(match => (
                  <div key={match.id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{match.home_team} — {match.away_team}</p>
                      <p className="text-[10px] text-muted-foreground">{formatMatchDate(match.match_date, match.match_time)}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${(MATCH_STATUS[match.status] ?? MATCH_STATUS.planned).color}`}>
                      {(MATCH_STATUS[match.status] ?? MATCH_STATUS.planned).label}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Top active members */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="w-4 h-4 text-primary" />
            Membres les plus actifs (30 jours)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 rounded-lg bg-muted/40 animate-pulse" />)}</div>
          ) : !data?.topMembers?.length ? (
            <p className="text-sm text-muted-foreground italic text-center py-4">Aucune donnée disponible</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.topMembers.map((member, idx) => (
                <div key={member.user_id} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-muted/10">
                  <span className="text-xs text-muted-foreground w-4 shrink-0 text-right font-bold">{idx + 1}</span>
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={member.photo_url ?? undefined} />
                    <AvatarFallback className="text-xs">{member.name?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.msg_count} message{member.msg_count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
