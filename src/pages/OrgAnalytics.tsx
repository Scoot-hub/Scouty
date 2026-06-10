import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, PieChart, Pie, Cell,
} from 'recharts';
import OrgTabBar from '@/components/OrgTabBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentOrg } from '@/hooks/use-organization';
import { BarChart2, MessageSquare, Users, ListChecks } from 'lucide-react';

function authInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

interface AnalyticsData {
  pipeline: { status: string; count: number }[];
  msgPerDay: { day: string; count: number }[];
  msgPerMember: { name: string; count: number }[];
  membersOverTime: { yw: number; week_start: string; count: number }[];
  shortlistOverTime: { yw: number; week_start: string; count: number }[];
  shortlistByPosition: { position: string; count: number }[];
  matchStats: { status: string; count: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  en_veille: 'En veille',
  a_observer: 'À observer',
  en_discussion: 'En discussion',
  approche: 'Approché',
};

const MATCH_STATUS_LABELS: Record<string, string> = {
  planned: 'Planifiés',
  done: 'Effectués',
  cancelled: 'Annulés',
};

const MATCH_STATUS_COLORS: Record<string, string> = {
  planned: '#60a5fa',
  done: '#34d399',
  cancelled: '#f87171',
};

const PIPELINE_COLORS = ['#94a3b8', '#60a5fa', '#fbbf24', '#34d399'];

function useOrgAnalytics(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-analytics', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AnalyticsData> => {
      const res = await fetch(`/api/organizations/${orgId}/analytics`, authInit());
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });
}

function formatDay(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  } catch { return dateStr; }
}

function EmptyChart() {
  return (
    <div className="h-40 flex items-center justify-center text-muted-foreground text-sm italic">
      Pas encore de données
    </div>
  );
}

export default function OrgAnalytics() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { data: org } = useCurrentOrg();
  const orgId = org?.id as string | undefined;

  const { data, isLoading } = useOrgAnalytics(orgId);
  if (!org && !isLoading) return null;

  const pipelineData = (data?.pipeline ?? []).map(r => ({
    name: STATUS_LABELS[r.status] ?? r.status,
    value: r.count,
  }));

  const msgDayData = (data?.msgPerDay ?? []).map(r => ({
    day: formatDay(r.day),
    messages: r.count,
  }));

  const memberActivityData = (data?.msgPerMember ?? []).map(r => ({
    name: r.name?.split(' ')[0] ?? '?',
    messages: r.count,
  }));

  const membersTimeData = (data?.membersOverTime ?? []).map(r => ({
    week: formatDay(r.week_start),
    membres: r.count,
  }));

  const shortlistTimeData = (data?.shortlistOverTime ?? []).map(r => ({
    week: formatDay(r.week_start),
    joueurs: r.count,
  }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <OrgTabBar orgName={orgSlug ?? ''} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OrgTabBar orgName={orgSlug ?? ''} />

      <div>
        <h2 className="text-lg font-bold">Analytics</h2>
        <p className="text-sm text-muted-foreground">Données sur les 30 derniers jours sauf mention contraire</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shortlist pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks className="w-4 h-4 text-primary" />
              Pipeline de recrutement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!pipelineData.length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pipelineData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {pipelineData.map((_, i) => (
                      <Cell key={i} fill={PIPELINE_COLORS[i % PIPELINE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Messages per day */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="w-4 h-4 text-primary" />
              Messages par jour (30 jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!msgDayData.length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={msgDayData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="messages" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Messages per member */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-primary" />
              Activité par membre (30 jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!memberActivityData.filter(d => d.messages > 0).length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={memberActivityData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Members + Shortlist over time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart2 className="w-4 h-4 text-primary" />
              Croissance (12 semaines)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!membersTimeData.length && !shortlistTimeData.length ? <EmptyChart /> : (() => {
              // Merge both series by week
              const weekMap = new Map<string, { week: string; membres: number; joueurs: number }>();
              membersTimeData.forEach(d => weekMap.set(d.week, { week: d.week, membres: d.membres, joueurs: 0 }));
              shortlistTimeData.forEach(d => {
                const existing = weekMap.get(d.week);
                if (existing) existing.joueurs = d.joueurs;
                else weekMap.set(d.week, { week: d.week, membres: 0, joueurs: d.joueurs });
              });
              const combined = Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));
              return (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={combined} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="membres" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="joueurs" fill="#34d399" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>
        {/* Shortlist by position */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks className="w-4 h-4 text-primary" />
              Shortlist par poste
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!(data?.shortlistByPosition ?? []).length ? <EmptyChart /> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={(data?.shortlistByPosition ?? []).map(r => ({ position: r.position, joueurs: r.count }))}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="position" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="joueurs" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Match stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart2 className="w-4 h-4 text-primary" />
              Matchs (3 derniers mois)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!(data?.matchStats ?? []).length ? <EmptyChart /> : (() => {
              const matchData = (data?.matchStats ?? []).map(r => ({
                status: MATCH_STATUS_LABELS[r.status] ?? r.status,
                count: r.count,
                fill: MATCH_STATUS_COLORS[r.status] ?? '#94a3b8',
              }));
              return (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={matchData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="status" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {matchData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
