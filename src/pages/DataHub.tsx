import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WyscoutCatalogSearch } from '@/components/wyscout/CatalogSearch';
import {
  Database, SlidersHorizontal, ScatterChart as ScatterIcon,
  GitCompareArrows, Crosshair, ChevronRight, FileSpreadsheet, TrendingUp,
} from 'lucide-react';

interface HubCard {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
}

const CARDS: HubCard[] = [
  {
    to: '/data/explore',
    icon: SlidersHorizontal, iconBg: 'bg-violet-500/10', iconColor: 'text-violet-500',
    titleKey: 'data.hub_explore_title', titleFallback: 'Recherche par data',
    descKey: 'data.hub_explore_desc', descFallback: 'Partez des statistiques pour trouver des joueurs : filtres par poste, ligue, âge et seuils (valeurs ou percentiles).',
  },
  {
    to: '/data/scatter',
    icon: ScatterIcon, iconBg: 'bg-sky-500/10', iconColor: 'text-sky-500',
    titleKey: 'data.hub_scatter_title', titleFallback: 'Nuage de points',
    descKey: 'data.hub_scatter_desc', descFallback: 'Croisez deux statistiques sur toute une population, visualisez les quadrants et repérez les profils atypiques.',
  },
  {
    to: '/data/profile',
    icon: Crosshair, iconBg: 'bg-amber-500/10', iconColor: 'text-amber-500',
    titleKey: 'data.hub_profile_title', titleFallback: 'Profils & rôles',
    descKey: 'data.hub_profile_desc', descFallback: 'Classez la base selon un rôle prédéfini ou vos propres pondérations de critères.',
  },
  {
    to: '/data/projection',
    icon: TrendingUp, iconBg: 'bg-rose-500/10', iconColor: 'text-rose-500',
    titleKey: 'data.hub_projection_title', titleFallback: 'Projection championnat',
    descKey: 'data.hub_projection_desc', descFallback: 'Projetez les stats d\'un joueur dans un autre championnat pour jauger son adaptation.',
  },
  {
    to: '/data/compare',
    icon: GitCompareArrows, iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-500',
    titleKey: 'data.hub_compare_title', titleFallback: 'Comparateur',
    descKey: 'data.hub_compare_desc', descFallback: 'Comparez plusieurs joueurs et saisons : radar, barres, scatter et table détaillée.',
  },
];

export default function DataHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Backward-compat: old comparison share links targeted /data#v=... — the
  // comparator now lives at /data/compare, so forward the hash there.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#v=')) {
      navigate(`/data/compare${window.location.hash}`, { replace: true });
    }
  }, [navigate]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <Database className="w-5 h-5 text-emerald-500" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('data.hub_title', 'Data')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('data.hub_subtitle', 'Base de statistiques partagée — recherchez, analysez, comparez.')}
          </p>
        </div>
        <Badge variant="outline" className="ml-auto text-[10px] gap-1">
          <FileSpreadsheet className="w-3 h-3 text-emerald-500" /> WyScout
        </Badge>
      </div>

      {/* Search → player profile */}
      <WyscoutCatalogSearch />

      {/* Entry cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CARDS.map(c => {
          const Icon = c.icon;
          return (
            <Link key={c.to} to={c.to} className="group">
              <Card className="card-warm h-full transition-colors hover:border-primary/40">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${c.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${c.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="font-semibold text-sm">{t(c.titleKey, c.titleFallback)}</h3>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t(c.descKey, c.descFallback)}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground/50 text-center">
        {t('data.hub_footer', 'Source : fichiers de statistiques WyScout importés.')}
      </p>
    </div>
  );
}
