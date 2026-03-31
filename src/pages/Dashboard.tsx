import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayers, useAllReports } from '@/hooks/use-players';
import { getPlayerAge, getAvatarGradient, resolveLeagueName } from '@/types/player';
import { FlagIcon } from '@/components/ui/flag-icon';
import { ClubBadge } from '@/components/ui/club-badge';
import { OpinionBadge } from '@/components/ui/opinion-badge';
import {
  Users, Trophy, Target, Calendar, MessageSquare, TrendingUp, FileText,
  PlusCircle, ArrowRight, Zap
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import stadiumHero from '@/assets/stadium-hero.jpg';

export default function Dashboard() {
  const { data: players = [] } = usePlayers();
  const { data: allReports = [] } = useAllReports();
  const { t, i18n } = useTranslation();

  const stats = useMemo(() => {
    const total = players.length;
    const suivre = players.filter(p => p.general_opinion === 'À suivre');
    const revoir = players.filter(p => p.general_opinion === 'À revoir');
    const defavorable = players.filter(p => p.general_opinion === 'Défavorable');
    return { total, suivre, revoir, defavorable };
  }, [players]);

  const recentReports = useMemo(() => {
    return [...allReports]
      .sort((a, b) => new Date(b.report_date).getTime() - new Date(a.report_date).getTime())
      .slice(0, 8)
      .map(r => ({ ...r, player: players.find(p => p.id === r.player_id) }));
  }, [allReports, players]);

  const dimensions = [
    { title: t('dashboard.by_league'), icon: Trophy, emoji: '🏆', count: `${new Set(players.map(p => resolveLeagueName(p.club, p.league)).filter(Boolean)).size} ${t('dashboard.leagues')}`, path: '/players?view=by-league', color: 'from-amber-500/10 to-yellow-500/10' },
    { title: t('dashboard.by_position'), icon: Target, emoji: '🎯', count: `${new Set(players.map(p => p.position)).size} ${t('dashboard.positions')}`, path: '/players?view=by-position', color: 'from-blue-500/10 to-indigo-500/10' },
    { title: t('dashboard.by_age'), icon: Calendar, emoji: '📅', count: `${players.filter(p => getPlayerAge(p.generation, p.date_of_birth) <= 21).length} ${t('dashboard.u21')}`, path: '/players?view=by-age', color: 'from-purple-500/10 to-fuchsia-500/10' },
    { title: t('dashboard.by_opinion'), icon: MessageSquare, emoji: '💬', count: t('dashboard.categories'), path: '/players?view=by-opinion', color: 'from-purple-500/10 to-violet-500/10' },
    { title: t('dashboard.by_potential'), icon: TrendingUp, emoji: '📈', count: `${players.filter(p => p.potential >= 8).length} ${t('dashboard.elite')}`, path: '/players?view=by-potential', color: 'from-rose-500/10 to-pink-500/10' },
    { title: t('dashboard.contracts'), icon: FileText, emoji: '📋', count: `${players.filter(p => p.contract_end && new Date(p.contract_end) < new Date('2027-01-01')).length} ${t('dashboard.players_count')}`, path: '/players?view=contracts', color: 'from-orange-500/10 to-red-500/10' },
  ];

  const formatDate = (date: string) => {
    const locale = i18n.language === 'es' ? 'es-ES' : i18n.language === 'en' ? 'en-GB' : 'fr-FR';
    return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Hero Banner */}
      <div className="relative rounded-2xl overflow-hidden h-48 md:h-56">
        <img src={stadiumHero} alt="Stadium" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/80 via-foreground/50 to-transparent" />
        <div className="absolute inset-0 flex items-center px-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-card">⚽ {t('dashboard.title')}</h1>
            <p className="text-card/80 mt-1 text-lg">{t('dashboard.subtitle')}</p>
            <div className="flex items-center gap-2 mt-3">
              <span className="px-3 py-1 rounded-full bg-card/20 backdrop-blur text-card text-sm font-semibold">
                {stats.total} {t('dashboard.players_count')}
              </span>
              <span className="px-3 py-1 rounded-full bg-success/30 backdrop-blur text-card text-sm font-semibold">
                ✅ {stats.suivre.length} {t('dashboard.to_follow').toLowerCase()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none card-warm bg-card">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-2xl">⚽</div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('dashboard.total_players')}</p>
                <p className="text-3xl font-extrabold font-mono">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {[
          { label: t('dashboard.to_follow'), data: stats.suivre, emoji: '✅', opinion: 'À suivre' as const },
          { label: t('dashboard.to_review'), data: stats.revoir, emoji: '🔶', opinion: 'À revoir' as const },
          { label: t('dashboard.unfavorable'), data: stats.defavorable, emoji: '❌', opinion: 'Défavorable' as const },
        ].map(({ label, data, emoji, opinion }) => (
          <Card key={label} className="border-none card-warm bg-card">
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center text-2xl">{emoji}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">{label}</p>
                    <OpinionBadge opinion={opinion} size="sm" />
                  </div>
                  <p className="text-3xl font-extrabold font-mono">{data.length}</p>
                  <p className="text-xs text-muted-foreground">{stats.total > 0 ? Math.round((data.length / stats.total) * 100) : 0}{t('common.of_total')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick access */}
      <div>
        <h2 className="text-xl font-extrabold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          {t('dashboard.quick_access')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {dimensions.map((dim) => (
            <Link key={dim.title} to={dim.path}>
              <Card className={`border-none card-warm cursor-pointer group bg-gradient-to-br ${dim.color} hover:scale-[1.02] transition-all duration-200`}>
                <CardContent className="p-5 flex items-center gap-4">
                  <span className="text-3xl">{dim.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base">{dim.title}</p>
                    <p className="text-sm text-muted-foreground">{dim.count}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold flex items-center gap-2">
            📝 {t('dashboard.recent_activity')}
          </h2>
          <Button asChild className="rounded-xl shadow-md">
            <Link to="/player/new">
              <PlusCircle className="w-4 h-4 mr-2" />
              {t('dashboard.add_player')}
            </Link>
          </Button>
        </div>
        <Card className="border-none card-warm">
          <CardContent className="p-0 divide-y divide-border">
            {recentReports.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">{t('dashboard.no_recent')}</div>
            )}
            {recentReports.map((report) => (
              <Link key={report.id} to={`/player/${report.player_id}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors group">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getAvatarGradient(report.player?.name ?? '')} flex items-center justify-center text-sm font-bold text-card shrink-0 shadow-sm`}>
                  {report.player?.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate group-hover:text-primary transition-colors">{report.player?.name ?? t('dashboard.unknown_player')}</p>
                    <FlagIcon nationality={report.player?.nationality ?? ''} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{formatDate(report.report_date)}</span>
                    <span>·</span>
                    <ClubBadge club={report.player?.club ?? ''} size="sm" />
                    <span>{report.player?.club}</span>
                  </p>
                </div>
                <OpinionBadge opinion={report.opinion} size="sm" />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
