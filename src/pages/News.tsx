import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useIsAdmin } from '@/hooks/use-admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  Search, RefreshCw, Newspaper, ExternalLink, Calendar,
  Filter, X, ChevronLeft, ChevronRight, User, Clock,
} from 'lucide-react';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface NewsArticle {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  article_url: string;
  category: string | null;
  author: string | null;
  published_at: string;
  source: string;
  tags: string[] | string;
}

interface NewsResponse {
  articles: NewsArticle[];
  total: number;
  categories: { category: string; count: number }[];
}

function formatDate(dateStr: string) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(dateStr));
  } catch { return dateStr; }
}

function timeAgo(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'À l\'instant';
    if (h < 24) return `Il y a ${h}h`;
    const days = Math.floor(h / 24);
    if (days < 7) return `Il y a ${days}j`;
    return formatDate(dateStr);
  } catch { return dateStr; }
}

// ── Featured article card ─────────────────────────────────────────────────────

function FeaturedCard({ article }: { article: NewsArticle }) {
  const [imgError, setImgError] = useState(false);
  return (
    <a
      href={article.article_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block relative rounded-2xl overflow-hidden aspect-[16/7] shadow-xl hover:shadow-2xl transition-all duration-300"
    >
      {article.image_url && !imgError ? (
        <img
          src={article.image_url}
          alt={article.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/10 to-accent/20 flex items-center justify-center">
          <Newspaper className="w-20 h-20 text-primary/20" />
        </div>
      )}
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1">
            À la une
          </Badge>
          {article.category && (
            <Badge variant="outline" className="border-white/30 text-white text-xs">
              {article.category}
            </Badge>
          )}
        </div>
        <h2 className="text-xl md:text-3xl font-black text-white leading-tight line-clamp-2 group-hover:text-primary/90 transition-colors">
          {article.title}
        </h2>
        {article.description && (
          <p className="text-sm text-white/70 leading-relaxed line-clamp-2 max-w-2xl hidden md:block">
            {article.description}
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-white/60">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {timeAgo(article.published_at)}
          </span>
          {article.author && (
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              {article.author}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 font-medium text-white/80 group-hover:text-white transition-colors">
            Lire l'article <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
}

// ── Article card ──────────────────────────────────────────────────────────────

function ArticleCard({ article }: { article: NewsArticle }) {
  const [imgError, setImgError] = useState(false);
  return (
    <a
      href={article.article_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col rounded-xl overflow-hidden border border-border/50 bg-card hover:border-primary/30 hover:shadow-xl transition-all duration-300 h-full"
    >
      {/* Image */}
      <div className="relative aspect-[16/9] overflow-hidden bg-muted shrink-0">
        {article.image_url && !imgError ? (
          <img
            src={article.image_url}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
            <Newspaper className="w-10 h-10 text-primary/20" />
          </div>
        )}
        {article.category && (
          <div className="absolute top-2.5 left-2.5">
            <Badge className="text-[10px] px-2 py-0.5 font-bold">{article.category}</Badge>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 space-y-2.5">
        <h3 className="text-sm font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {article.title}
        </h3>
        {article.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">
            {article.description}
          </p>
        )}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {timeAgo(article.published_at)}
          </span>
          {article.author && (
            <span className="flex items-center gap-1 truncate max-w-[120px]">
              <User className="w-3 h-3 shrink-0" />
              {article.author}
            </span>
          )}
          <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </a>
  );
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────

function FeaturedSkeleton() {
  return <Skeleton className="w-full aspect-[16/7] rounded-2xl" />;
}

function ArticleSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <Skeleton className="aspect-[16/9]" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

export default function News() {
  const { t } = useTranslation();
  const { data: isAdmin } = useIsAdmin();

  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage]         = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    ...(search   ? { search }   : {}),
    ...(category ? { category } : {}),
  });

  const { data, isLoading, refetch } = useQuery<NewsResponse>({
    queryKey: ['news', search, category, page],
    queryFn: async () => {
      const res = await fetch(`${API}/news?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement actualités');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = useCallback(async () => {
    if (!isAdmin) return;
    setRefreshing(true);
    try {
      const res = await fetch(`${API}/admin/news/refresh`, { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (res.ok) {
        toast.success(`${d.saved} article${d.saved > 1 ? 's' : ''} récupéré${d.saved > 1 ? 's' : ''}`);
        refetch();
      } else {
        toast.error(d.error || 'Erreur lors du scraping');
      }
    } catch { toast.error('Erreur réseau'); }
    finally { setRefreshing(false); }
  }, [isAdmin, refetch]);

  const articles = data?.articles || [];
  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);
  const categories = data?.categories || [];
  const featured = articles[0];
  const rest = articles.slice(1);
  const hasFilters = !!(search || category);

  const clearFilters = () => { setSearch(''); setCategory(''); setPage(0); };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-primary" />
            Actualités Football
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Les dernières infos foot depuis Sofascore
            {data?.total ? ` · ${data.total} article${data.total > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Scraping…' : 'Actualiser'}
          </Button>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Rechercher…"
            className="pl-9"
          />
        </div>

        <Select value={category} onValueChange={v => { setCategory(v === '_all' ? '' : v); setPage(0); }}>
          <SelectTrigger className="w-44">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Toutes</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.category} value={c.category}>
                {c.category} <span className="text-muted-foreground ml-1">({c.count})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
            <X className="w-3.5 h-3.5" /> Effacer
          </Button>
        )}
      </div>

      {/* ── Content ── */}
      {isLoading ? (
        <>
          <FeaturedSkeleton />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => <ArticleSkeleton key={i} />)}
          </div>
        </>
      ) : articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Newspaper className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <div>
            <p className="font-semibold">Aucun article trouvé</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasFilters ? 'Essayez d\'autres filtres.' : isAdmin
                ? 'Cliquez sur "Actualiser" pour récupérer les dernières actualités Sofascore.'
                : 'Les actualités arrivent bientôt.'}
            </p>
          </div>
          {hasFilters && <Button variant="outline" size="sm" onClick={clearFilters}>Réinitialiser les filtres</Button>}
        </div>
      ) : (
        <>
          {/* Featured — only on first page without filters */}
          {!hasFilters && page === 0 && featured && (
            <FeaturedCard article={featured} />
          )}

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {(hasFilters || page > 0 ? articles : rest).map(a => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline" size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                Page {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline" size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Admin status note */}
      {isAdmin && !isLoading && articles.length === 0 && (
        <div className="text-xs text-muted-foreground/60 text-center space-y-1">
          <p>Variable <code className="bg-muted px-1 rounded">APIFY_API_KEY</code> requise dans <code className="bg-muted px-1 rounded">.env</code> pour le scraping automatique.</p>
          <p>Le cron tourne automatiquement toutes les 3 heures.</p>
        </div>
      )}
    </div>
  );
}
