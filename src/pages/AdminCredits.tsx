import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { useQuery } from '@tanstack/react-query';
import { Navigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Zap } from 'lucide-react';

interface UserCreditRow {
  id: string;
  email: string;
  plan_type: string;
  used_today: number;
  used_week: number;
  used_month: number;
  used_total: number;
  earned_total: number;
}

const PLAN_QUOTAS: Record<string, { daily: number; weekly: number; monthly: number }> = {
  starter: { daily: 10, weekly: 50, monthly: 150 },
  pro:     { daily: 100, weekly: 500, monthly: 2000 },
  elite:   { daily: -1, weekly: -1, monthly: -1 },
};

function pctColor(used: number, quota: number) {
  if (quota === -1) return 'text-yellow-500';
  const pct = quota === 0 ? 0 : used / quota;
  if (pct >= 0.9) return 'text-red-500';
  if (pct >= 0.7) return 'text-amber-500';
  return 'text-green-600';
}

function planBadge(plan: string) {
  if (plan === 'elite') return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">Elite</Badge>;
  if (plan === 'pro') return <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">Pro</Badge>;
  return <Badge variant="secondary">Starter</Badge>;
}

export default function AdminCredits() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();

  const { data: rows = [], isLoading } = useQuery<UserCreditRow[]>({
    queryKey: ['admin-credits'],
    queryFn: async () => {
      const res = await fetch('/api/admin/credits', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
    staleTime: 30_000,
  });

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-yellow-500" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('credits.admin_title')}</h1>
          <p className="text-sm text-muted-foreground">{t('credits.admin_subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('credits.admin_table_title')}</CardTitle>
          <CardDescription>{t('credits.admin_table_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">{t('credits.col_user')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">{t('credits.col_plan')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">{t('credits.col_today')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">{t('credits.col_week')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">{t('credits.col_month')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">{t('credits.col_total')}</th>
                    <th className="pb-2 font-medium text-yellow-600 dark:text-yellow-400 text-right">{t('credits.col_earned')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const q = PLAN_QUOTAS[row.plan_type] || PLAN_QUOTAS.starter;
                    const unlimited = q.daily === -1;
                    return (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pr-4 font-mono text-xs truncate max-w-[200px]">{row.email}</td>
                        <td className="py-2.5 pr-4">{planBadge(row.plan_type)}</td>
                        <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${pctColor(row.used_today, q.daily)}`}>
                          {unlimited ? `${row.used_today} / ∞` : `${row.used_today} / ${q.daily}`}
                        </td>
                        <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${pctColor(row.used_week, q.weekly)}`}>
                          {unlimited ? `${row.used_week} / ∞` : `${row.used_week} / ${q.weekly}`}
                        </td>
                        <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${pctColor(row.used_month, q.monthly)}`}>
                          {unlimited ? `${row.used_month} / ∞` : `${row.used_month} / ${q.monthly}`}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-medium tabular-nums text-muted-foreground">
                          {row.used_total}
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                          {row.earned_total > 0 ? `+${row.earned_total}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">{t('credits.admin_empty')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
