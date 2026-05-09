import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useIsAdmin } from '@/hooks/use-admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Search, RefreshCw, Newspaper, ExternalLink, Calendar,
  Filter, X, ChevronLeft, ChevronRight, User, Clock,
  Zap, ArrowLeft, Loader2, BookOpen, AlertCircle, PenLine,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// ── Types ────────────────────────────────────────────────────────────────────

interface UnifiedItem {
  id: string;
  type: 'article' | 'buzz' | 'editorial';
  title: string;
  excerpt: string | null;
  image_url: string | null;
  url: string;
  category: string | null;
  author: string | null;
  published_at: string;
  source: string;
  has_content: 0 | 1;
}

interface UnifiedResponse {
  items: UnifiedItem[];
  total: number;
  categories: { category: string; count: number }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return 'À l\'instant';
    if (h < 24) return `Il y a ${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `Il y a ${d}j`;
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(dateStr));
  } catch { return dateStr; }
}

function sourceLabel(source: string) {
  const map: Record<string, string> = {
    sofascore: 'Sofascore', footballbuzz: 'Football Buzz', internal: 'Éditorial Scouty',
    'l-equipe': "L'Équipe", 'france-football': 'France Football',
  };
  return map[source] || source;
}

// ── Article reader — inline side panel ───────────────────────────────────────

interface ReaderState {
  item: UnifiedItem;
  content: string | null;
  loading: boolean;
  error: string | null;
  fallback_url: string | null;
}

function ArticleReader({ state, onClose }: { state: ReaderState; onClose: () => void }) {
  const [imgError, setImgError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const { item, content, loading, error, fallback_url } = state;
  const isBuzz = item.type === 'buzz';
  const isEditorial = item.type === 'editorial';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-2xl bg-background border-l border-border shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          <div className="flex items-center gap-2">
            {item.source === 'footballbuzz' ? (
              <Badge className="bg-orange-500/15 text-orange-600 border-orange-200 gap-1 text-[10px]">
                <Zap className="w-3 h-3" /> Football Buzz
              </Badge>
            ) : isEditorial ? (
              <Badge className="bg-primary/15 text-primary gap-1 text-[10px]">
                <PenLine className="w-3 h-3" /> Éditorial Scouty
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">{sourceLabel(item.source)}</Badge>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Source
            </a>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Hero image */}
          {item.image_url && !imgError && (
            <div className="relative aspect-[16/7] overflow-hidden shrink-0">
              <img
                src={item.image_url}
                alt={item.title}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
            </div>
          )}

          <div className="px-6 py-6 space-y-5">
            {/* Category + source */}
            <div className="flex items-center gap-2 flex-wrap">
              {item.category && <Badge className="text-[10px]">{item.category}</Badge>}
              <span className="text-xs text-muted-foreground">{sourceLabel(item.source)}</span>
            </div>

            {/* Title */}
            <h1 className={cn('font-black leading-tight tracking-tight', isBuzz ? 'text-lg' : 'text-2xl')}>
              {item.title}
            </h1>

            {/* Meta */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {timeAgo(item.published_at)}
              </span>
              {item.author && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  {item.author}
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Content area */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium">Chargement du contenu complet…</p>
                  <p className="text-xs text-muted-foreground mt-1">Récupération via Apify en cours</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{error}</p>
                {fallback_url && (
                  <a href={fallback_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-2">
                      <ExternalLink className="w-4 h-4" /> Ouvrir l'article original
                    </Button>
                  </a>
                )}
              </div>
            ) : content ? (
              <div className={cn(
                'prose prose-sm dark:prose-invert max-w-none leading-relaxed',
                'prose-headings:font-bold prose-headings:tracking-tight',
                'prose-p:text-foreground/90 prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
                'prose-img:rounded-lg prose-img:shadow',
              )}>
                {/* Render markdown-ish content — strip HTML tags for safety, render as paragraphs */}
                <ArticleContentRenderer content={content} />
              </div>
            ) : item.excerpt ? (
              /* No full content yet — show excerpt + load button */
              <div className="space-y-4">
                <p className="text-sm text-foreground/80 leading-relaxed">{item.excerpt}</p>
                {!isBuzz && (
                  <div className="flex items-center gap-3 pt-2">
                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-2">
                        <ExternalLink className="w-4 h-4" /> Lire sur {sourceLabel(item.source)}
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground">Aucun contenu disponible</p>
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block">
                  <Button variant="outline" size="sm" className="gap-2">
                    <ExternalLink className="w-4 h-4" /> Voir l'article original
                  </Button>
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="shrink-0 border-t px-6 py-4 flex items-center justify-between gap-3 bg-muted/30">
          <p className="text-[10px] text-muted-foreground">
            {isBuzz ? 'Source : Football Buzz' : isEditorial ? 'Article interne Scouty' : `Source : ${sourceLabel(item.source)} · ${item.url}`}
          </p>
          {isEditorial ? (
            <Link to={`/editorial/${item.id}`} onClick={onClose}>
              <Button size="sm" className="gap-2 text-xs">
                <PenLine className="w-3.5 h-3.5" /> Voir l'article
              </Button>
            </Link>
          ) : (
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-2 text-xs">
                <ExternalLink className="w-3.5 h-3.5" /> Voir la source
              </Button>
            </a>
          )}
        </div>
      </div>
    </>
  );
}

// Simple markdown→HTML renderer (no external lib needed)
function ArticleContentRenderer({ content }: { content: string }) {
  // Convert markdown-ish content to readable paragraphs
  const paragraphs = content
    .replace(/#{1,6}\s+(.+)/g, '\n**$1**\n')   // headings → bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')    // strip links but keep text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')      // strip images
    .replace(/^[-*]\s+/gm, '• ')                // bullets
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: p }} />
      ))}
    </div>
  );
}

// ── Card components ───────────────────────────────────────────────────────────

function FeaturedCard({ item, onClick }: { item: UnifiedItem; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const isBuzz = item.type === 'buzz';
  const isEditorial = item.type === 'editorial';

  const content = (
    <div className="group relative rounded-2xl overflow-hidden aspect-[16/7] shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer">
      {item.image_url && !imgError ? (
        <img src={item.image_url} alt={item.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
          onError={() => setImgError(true)} />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-primary/30 via-primary/10 to-accent/20 flex items-center justify-center">
          {isBuzz ? <Zap className="w-20 h-20 text-orange-400/30" />
           : isEditorial ? <PenLine className="w-20 h-20 text-primary/20" />
           : <Newspaper className="w-20 h-20 text-primary/20" />}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1">À la une</Badge>
          {isBuzz && <Badge className="bg-orange-500 text-white text-xs gap-1"><Zap className="w-3 h-3" /> Football Buzz</Badge>}
          {isEditorial && <Badge className="bg-white/20 text-white text-xs gap-1"><PenLine className="w-3 h-3" /> Éditorial</Badge>}
          {item.category && !isEditorial && <Badge variant="outline" className="border-white/30 text-white text-xs">{item.category}</Badge>}
        </div>
        <h2 className="text-xl md:text-3xl font-black text-white leading-tight line-clamp-2 group-hover:text-primary/90 transition-colors">
          {item.title}
        </h2>
        {item.excerpt && (
          <p className="text-sm text-white/70 leading-relaxed line-clamp-2 max-w-2xl hidden md:block">{item.excerpt}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-white/60">
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{timeAgo(item.published_at)}</span>
          {item.author && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{item.author}</span>}
          <span className="ml-auto flex items-center gap-1 font-medium text-white/80 group-hover:text-white transition-colors">
            <BookOpen className="w-3.5 h-3.5" /> Lire l'article
          </span>
        </div>
      </div>
    </div>
  );

  if (isEditorial) return <Link to={`/editorial/${item.id}`}>{content}</Link>;
  return <div onClick={onClick}>{content}</div>;
}

function ItemCard({ item, onClick }: { item: UnifiedItem; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  const isBuzz = item.type === 'buzz';
  const isEditorial = item.type === 'editorial';

  const content = (
    <div className="group flex flex-col rounded-xl overflow-hidden border border-border/50 bg-card hover:border-primary/30 hover:shadow-xl transition-all duration-300 h-full cursor-pointer">
      {/* Image / type badge */}
      <div className={cn('relative overflow-hidden shrink-0',
        isBuzz ? 'min-h-[60px] bg-gradient-to-br from-orange-500/10 to-amber-500/5'
        : 'aspect-[16/9] bg-muted')}>
        {!isBuzz && item.image_url && !imgError ? (
          /* Article ou éditorial avec image */
          <img src={item.image_url} alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)} />
        ) : isBuzz ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <Zap className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">Football Buzz</span>
            {item.author && <span className="text-[10px] text-muted-foreground ml-auto">@{item.author}</span>}
          </div>
        ) : (
          /* Fallback sans image */
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
            {isEditorial
              ? <PenLine className="w-10 h-10 text-primary/20" />
              : <Newspaper className="w-10 h-10 text-primary/20" />}
          </div>
        )}
        {/* Badge catégorie/éditorial en overlay */}
        {!isBuzz && (
          <div className="absolute top-2.5 left-2.5">
            {isEditorial
              ? <Badge className="text-[10px] px-2 py-0.5 font-bold bg-primary/90 text-primary-foreground gap-1">
                  <PenLine className="w-2.5 h-2.5" /> Éditorial
                </Badge>
              : item.category
                ? <Badge className="text-[10px] px-2 py-0.5 font-bold">{item.category}</Badge>
                : null}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4 space-y-2.5">
        <h3 className="text-sm font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors">{item.title}</h3>
        {item.excerpt && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 flex-1">{item.excerpt}</p>
        )}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/30">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{timeAgo(item.published_at)}</span>
          <span className="flex items-center gap-1 text-primary/70 group-hover:text-primary transition-colors font-medium">
            <BookOpen className="w-3 h-3" /> Lire
          </span>
        </div>
      </div>
    </div>
  );

  if (isEditorial) return <Link to={`/editorial/${item.id}`} className="block h-full">{content}</Link>;
  return <div onClick={onClick} className="h-full">{content}</div>;
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────

function FeaturedSkeleton() { return <Skeleton className="w-full aspect-[16/7] rounded-2xl" />; }
function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <Skeleton className="aspect-[16/9]" />
      <div className="p-4 space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;
type TypeFilter = '' | 'article' | 'buzz' | 'editorial';

export default function News() {
  const { t } = useTranslation();
  const { data: isAdmin } = useIsAdmin();
  const navigate = useNavigate();

  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [page, setPage]         = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [reader, setReader]     = useState<ReaderState | null>(null);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    ...(search     ? { search }     : {}),
    ...(category   ? { category }   : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  });

  const { data, isLoading, refetch } = useQuery<UnifiedResponse>({
    queryKey: ['news-unified', search, category, typeFilter, page],
    queryFn: async () => {
      const res = await fetch(`${API}/news/unified?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement actualités');
      return res.json();
    },
    staleTime: 3 * 60 * 1000,
  });

  const openReader = useCallback(async (item: UnifiedItem) => {
    // Editorial articles → full dedicated page with reactions & share
    if (item.type === 'editorial') {
      // url field contains the article id for internal articles
      navigate(`/editorial/${item.id}`);
      return;
    }

    // Buzz posts: content is already in DB
    if (item.type === 'buzz') {
      setReader({ item, content: item.excerpt, loading: false, error: null, fallback_url: item.url });
      return;
    }

    // Articles: check if content is cached (has_content=1) or need Apify
    if (item.has_content === 1) {
      // Load from server (already cached)
      setReader({ item, content: null, loading: true, error: null, fallback_url: null });
      try {
        const res = await fetch(`${API}/news/content/${item.id}`, { credentials: 'include' });
        const d = await res.json();
        setReader({ item, content: d.content, loading: false, error: null, fallback_url: d.fallback_url || item.url });
      } catch {
        setReader({ item, content: null, loading: false, error: 'Impossible de charger le contenu.', fallback_url: item.url });
      }
      return;
    }

    // No content stored yet — show excerpt immediately, then load via Apify in background
    setReader({ item, content: null, loading: true, error: null, fallback_url: null });
    try {
      const res = await fetch(`${API}/news/content/${item.id}`, { credentials: 'include' });
      const d = await res.json();
      if (d.content) {
        setReader({ item, content: d.content, loading: false, error: null, fallback_url: null });
      } else {
        setReader({ item, content: null, loading: false, error: null, fallback_url: d.fallback_url || item.url });
      }
    } catch {
      setReader({ item, content: null, loading: false, error: 'Erreur lors du chargement via Apify.', fallback_url: item.url });
    }
  }, [navigate]);

  const handleRefresh = useCallback(async () => {
    if (!isAdmin) return;
    setRefreshing(true);
    try {
      const res = await fetch(`${API}/admin/news/refresh`, { method: 'POST', credentials: 'include' });
      const d = await res.json();
      if (res.ok) { toast.success(`${d.saved} article${d.saved > 1 ? 's' : ''} récupéré${d.saved > 1 ? 's' : ''}`); refetch(); }
      else toast.error(d.error || 'Erreur lors du scraping');
    } catch { toast.error('Erreur réseau'); }
    finally { setRefreshing(false); }
  }, [isAdmin, refetch]);

  const items      = data?.items || [];
  const totalPages = Math.ceil((data?.total || 0) / PAGE_SIZE);
  const categories = data?.categories || [];
  const featured   = items[0];
  const rest       = items.slice(1);
  const hasFilters = !!(search || category || typeFilter);

  const clearFilters = () => { setSearch(''); setCategory(''); setTypeFilter(''); setPage(0); };

  const articleCount = items.filter(i => i.type === 'article').length;
  const buzzCount    = items.filter(i => i.type === 'buzz').length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Newspaper className="w-6 h-6 text-primary" />
            Actualités Football
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Articles Sofascore · Football Buzz
            {data?.total ? ` · ${data.total} résultat${data.total > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            {refreshing ? 'Scraping…' : 'Actualiser'}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Rechercher…" className="pl-9" />
        </div>

        {/* Type toggle */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {([['', 'Tous'], ['article', 'Sofascore'], ['buzz', 'Buzz'], ['editorial', 'Éditorial']] as [TypeFilter, string][]).map(([v, label]) => (
            <button key={v} onClick={() => { setTypeFilter(v); setPage(0); }}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all',
                typeFilter === v ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {v === 'buzz' && <Zap className="w-3 h-3 inline mr-1 text-orange-500" />}
              {v === 'editorial' && <PenLine className="w-3 h-3 inline mr-1 text-primary" />}
              {label}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
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
        )}

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
            <X className="w-3.5 h-3.5" /> Effacer
          </Button>
        )}

        {/* Source counts */}
        {!isLoading && items.length > 0 && (
          <div className="flex items-center gap-2 ml-auto text-[10px] text-muted-foreground">
            {articleCount > 0 && <span className="flex items-center gap-1"><Newspaper className="w-3 h-3" />{articleCount} article{articleCount > 1 ? 's' : ''}</span>}
            {buzzCount > 0 && <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-orange-500" />{buzzCount} buzz</span>}
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <>
          <FeaturedSkeleton />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => <CardSkeleton key={i} />)}
          </div>
        </>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Newspaper className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <div>
            <p className="font-semibold">Aucun résultat</p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasFilters ? 'Essayez d\'autres filtres.' : isAdmin
                ? 'Cliquez sur "Actualiser" pour récupérer les dernières actualités.'
                : 'Les actualités arrivent bientôt.'}
            </p>
          </div>
          {hasFilters && <Button variant="outline" size="sm" onClick={clearFilters}>Réinitialiser</Button>}
        </div>
      ) : (
        <>
          {/* Featured */}
          {!hasFilters && page === 0 && featured && (
            <FeaturedCard item={featured} onClick={() => openReader(featured)} />
          )}

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {(hasFilters || page > 0 ? items : rest).map(item => (
              <ItemCard key={item.id} item={item} onClick={() => openReader(item)} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-3">Page {page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {isAdmin && !isLoading && items.length === 0 && (
        <p className="text-xs text-muted-foreground/60 text-center">
          Variable <code className="bg-muted px-1 rounded">APIFY_API_KEY</code> requise dans <code className="bg-muted px-1 rounded">.env</code> pour le scraping automatique.
        </p>
      )}

      {/* Inline article reader */}
      {reader && <ArticleReader state={reader} onClose={() => setReader(null)} />}
    </div>
  );
}
