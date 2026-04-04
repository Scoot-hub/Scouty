import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Navigate, Link } from 'react-router-dom';
import {
  Users, Crown, TrendingUp, BarChart3, Zap, Star, Building2,
  CalendarDays, Eye, FileText, MessageSquare, Shield, ArrowLeft,
  Activity, UserPlus, CreditCard, Sparkles, Target, Contact
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

type Range = '1d' | '7d' | '30d' | '90d' | '1y' | 'all';

const RANGES: { value: Range; label: string }[] = [
  { value: '1d', label: 'analytics.range_1d' },
  { value: '7d', label: 'analytics.range_7d' },
  { value: '30d', label: 'analytics.range_30d' },
  { value: '90d', label: 'analytics.range_90d' },
  { value: '1y', label: 'analytics.range_1y' },
  { value: 'all', label: 'analytics.range_all' },
];

interface Analytics {
  users: { total_users: number; new_users: number; active_users: number; active_today: number; active_7d: number; active_30d: number; users_2fa: number };
  subscriptions: { premium_users: number; new_premium: number; churned: number; plan_breakdown: { plan: string; billing_cycle: string | null; count: number }[] };
  players: { total_players: number; new_players: number; enriched_players: number; enriched_period: number; avg_players_per_user: number };
  reports: { total_reports: number; new_reports: number };
  organizations: { total_orgs: number; total_org_members: number };
  matches: { total_matches: number; new_matches: number; status_breakdown: { status: string; count: number }[] };
  engagement: { total_watchlists: number; total_shadow_teams: number; total_contacts: number };
  feedback: { total_feedback: number; avg_rating: number; rating_breakdown: { rating: number; count: number }[] };
  enrichment: { enrichment_notifs: number };
  timeSeries: { users: { period: string; count: number }[]; players: { period: string; count: number }[]; premium: { period: string; count: number }[] };
  topUsers: { email: string; player_count: number }[];
  opinionBreakdown: { general_opinion: string; count: number }[];
}

function useAnalytics(range: Range) {
  return useQuery<Analytics>({
    queryKey: ['admin-analytics', range],
    queryFn: async () => {
      const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
      const res = await fetch(`${API_BASE}/admin/analytics?range=${range}`, {
        headers: session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    staleTime: 60_000,
  });
}

// Simple sparkline-style bar chart
function MiniBarChart({ data, color = 'bg-primary' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
            {d.label}: {d.value}
          </div>
          <div className={cn('w-full rounded-t-sm transition-all', color)} style={{ height: `${Math.max((d.value / max) * 100, 4)}%` }} />
        </div>
      ))}
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={cn('w-4 h-4', i <= Math.round(rating) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30')} />
      ))}
      <span className="ml-1.5 text-sm font-bold">{rating.toFixed(1)}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, trend, className }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; trend?: string; className?: string;
}) {
  return (
    <Card className={cn('border-none card-warm', className)}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-extrabold font-mono">{value}</p>
              {trend && <span className="text-xs font-semibold text-success">{trend}</span>}
            </div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminAnalytics() {
  const { t, i18n } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [range, setRange] = useState<Range>('30d');
  const { data, isLoading } = useAnalytics(range);

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  const rangeLabel = t(RANGES.find(r => r.value === range)!.label);

  const formatDate = (d: string) => {
    if (d.includes('-') && d.length === 7) return new Date(d + '-01').toLocaleDateString(i18n.language, { month: 'short', year: '2-digit' });
    if (d.includes('-') && d.length === 10) return new Date(d).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
    return d;
  };

  const pct = (a: number, b: number) => b > 0 ? `${Math.round((a / b) * 100)}%` : '—';

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              {t('analytics.title')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('analytics.subtitle')}</p>
          </div>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                range === r.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-none"><CardContent className="p-5"><div className="h-16 bg-muted/50 rounded-xl animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          {/* Section 1: Users */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> {t('analytics.section_users')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label={t('analytics.total_users')} value={data.users.total_users} />
              <StatCard icon={UserPlus} label={t('analytics.new_users')} value={data.users.new_users} sub={rangeLabel} />
              <StatCard icon={Activity} label={t('analytics.active_users')} value={data.users.active_users} sub={rangeLabel} trend={pct(data.users.active_users, data.users.total_users)} />
              <StatCard icon={Shield} label={t('analytics.users_2fa')} value={data.users.users_2fa} sub={pct(data.users.users_2fa, data.users.total_users) + ' ' + t('analytics.adoption')} />
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <Card className="border-none card-warm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">{t('analytics.active_today')}</p>
                  <p className="text-xl font-extrabold font-mono mt-1">{data.users.active_today}</p>
                </CardContent>
              </Card>
              <Card className="border-none card-warm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">{t('analytics.active_7d')}</p>
                  <p className="text-xl font-extrabold font-mono mt-1">{data.users.active_7d}</p>
                </CardContent>
              </Card>
              <Card className="border-none card-warm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">{t('analytics.active_30d')}</p>
                  <p className="text-xl font-extrabold font-mono mt-1">{data.users.active_30d}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Section 2: Revenue / Subscriptions */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> {t('analytics.section_revenue')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Crown} label={t('analytics.premium_users')} value={data.subscriptions.premium_users} sub={pct(data.subscriptions.premium_users, data.users.total_users) + ' ' + t('analytics.conversion')} />
              <StatCard icon={TrendingUp} label={t('analytics.new_premium')} value={data.subscriptions.new_premium} sub={rangeLabel} />
              <StatCard icon={CreditCard} label={t('analytics.mrr_estimate')} value={(() => {
                let mrr = 0;
                for (const p of data.subscriptions.plan_breakdown) {
                  const prices: Record<string, number> = { scout: 19, pro: 29, elite: 99 };
                  const price = prices[p.plan] || 0;
                  mrr += p.billing_cycle === 'annual' ? Math.round((price * 10 / 12) * p.count) : price * p.count;
                }
                return `${mrr}€`;
              })()} sub={t('analytics.mrr_desc')} />
              <StatCard icon={Activity} label={t('analytics.churn')} value={data.subscriptions.churned} sub={t('analytics.churn_desc')} />
            </div>

            {/* Plan breakdown */}
            {data.subscriptions.plan_breakdown.length > 0 && (
              <Card className="border-none card-warm mt-4">
                <CardContent className="p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('analytics.plan_breakdown')}</p>
                  <div className="flex flex-wrap gap-2">
                    {data.subscriptions.plan_breakdown.map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-sm py-1 px-3">
                        <Crown className="w-3 h-3 mr-1.5" />
                        {p.plan} {p.billing_cycle && `(${p.billing_cycle})`} — <span className="font-bold ml-1">{p.count}</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Section 3: Content & Enrichment */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> {t('analytics.section_content')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label={t('analytics.total_players')} value={data.players.total_players} sub={`+${data.players.new_players} ${rangeLabel}`} />
              <StatCard icon={Zap} label={t('analytics.enriched')} value={data.players.enriched_players} sub={pct(data.players.enriched_players, data.players.total_players) + ' ' + t('analytics.of_total')} />
              <StatCard icon={Sparkles} label={t('analytics.enriched_period')} value={data.players.enriched_period} sub={rangeLabel} />
              <StatCard icon={Target} label={t('analytics.avg_per_user')} value={data.players.avg_players_per_user} sub={t('analytics.players_per_user')} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <StatCard icon={FileText} label={t('analytics.total_reports')} value={data.reports.total_reports} sub={`+${data.reports.new_reports} ${rangeLabel}`} />
              <StatCard icon={Eye} label={t('analytics.watchlists')} value={data.engagement.total_watchlists} />
              <StatCard icon={Users} label={t('analytics.shadow_teams')} value={data.engagement.total_shadow_teams} />
              <StatCard icon={Contact} label={t('analytics.contacts')} value={data.engagement.total_contacts} />
            </div>
          </div>

          {/* Section 4: Organizations & Matches */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> {t('analytics.section_orgs')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Building2} label={t('analytics.orgs')} value={data.organizations.total_orgs} sub={`${data.organizations.total_org_members} ${t('analytics.members')}`} />
              <StatCard icon={CalendarDays} label={t('analytics.matches')} value={data.matches.total_matches} sub={`+${data.matches.new_matches} ${rangeLabel}`} />
              {data.matches.status_breakdown.map(s => (
                <Card key={s.status} className="border-none card-warm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground capitalize">{s.status}</p>
                    <p className="text-xl font-extrabold font-mono mt-1">{s.count}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Section 5: Time Series Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* User registrations */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  {t('analytics.registrations')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-5">
                {data.timeSeries.users.length > 0 ? (
                  <MiniBarChart data={data.timeSeries.users.map(d => ({ label: formatDate(d.period), value: d.count }))} color="bg-primary" />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">{t('analytics.no_data')}</p>
                )}
              </CardContent>
            </Card>

            {/* Player creations */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  {t('analytics.player_creations')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-5">
                {data.timeSeries.players.length > 0 ? (
                  <MiniBarChart data={data.timeSeries.players.map(d => ({ label: formatDate(d.period), value: d.count }))} color="bg-accent" />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">{t('analytics.no_data')}</p>
                )}
              </CardContent>
            </Card>

            {/* Premium conversions */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  {t('analytics.premium_conversions')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-5">
                {data.timeSeries.premium.length > 0 ? (
                  <MiniBarChart data={data.timeSeries.premium.map(d => ({ label: formatDate(d.period), value: d.count }))} color="bg-amber-500" />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">{t('analytics.no_data')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Section 6: Feedback & Top Users */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Feedback */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  {t('analytics.feedback')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('analytics.avg_rating')}</p>
                    <RatingStars rating={data.feedback.avg_rating} />
                  </div>
                  <Badge variant="secondary">{data.feedback.total_feedback} {t('analytics.responses')}</Badge>
                </div>
                {data.feedback.rating_breakdown.length > 0 && (
                  <div className="space-y-1.5">
                    {[5, 4, 3, 2, 1].map(r => {
                      const entry = data.feedback.rating_breakdown.find(e => e.rating === r);
                      const count = entry?.count || 0;
                      const pctVal = data.feedback.total_feedback > 0 ? (count / data.feedback.total_feedback) * 100 : 0;
                      return (
                        <div key={r} className="flex items-center gap-2 text-xs">
                          <span className="w-3 text-right font-medium">{r}</span>
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pctVal}%` }} />
                          </div>
                          <span className="w-6 text-right text-muted-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top users */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {t('analytics.top_users')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.topUsers.map((u, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5">
                      <span className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        i === 0 ? 'bg-amber-500/20 text-amber-600' : i === 1 ? 'bg-gray-300/30 text-gray-500' : i === 2 ? 'bg-orange-400/20 text-orange-500' : 'bg-muted text-muted-foreground'
                      )}>{i + 1}</span>
                      <span className="text-sm truncate flex-1">{u.email}</span>
                      <Badge variant="outline" className="font-mono text-xs">{u.player_count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 7: Opinion breakdown */}
          {data.opinionBreakdown.length > 0 && (
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  {t('analytics.opinion_breakdown')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {data.opinionBreakdown.map((o, i) => {
                    const colors: Record<string, string> = { 'À suivre': 'bg-success/15 text-success', 'À revoir': 'bg-amber-500/15 text-amber-600', 'Défavorable': 'bg-destructive/15 text-destructive' };
                    return (
                      <div key={i} className={cn('px-4 py-2.5 rounded-xl', colors[o.general_opinion] || 'bg-muted text-muted-foreground')}>
                        <p className="text-xs font-medium">{o.general_opinion || t('analytics.not_set')}</p>
                        <p className="text-xl font-extrabold font-mono">{o.count}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
