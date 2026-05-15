import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useIsAdmin } from '@/hooks/use-admin';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Search, RefreshCw, Newspaper, ExternalLink, Calendar,
  Filter, X, User, Clock,
  Zap, ArrowLeft, Loader2, BookOpen, AlertCircle, PenLine,
  Languages, Globe,
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
  lang?: string | null;
  country?: string | null;
}

interface CountryFacet { country: string; count: number }

interface UnifiedResponse {
  items: UnifiedItem[];
  total: number;
  categories: { category: string; count: number }[];
  countries: CountryFacet[];
}

// ── Country / language metadata ──────────────────────────────────────────────

const COUNTRY_META: Record<string, { name: string; lang: string }> = {
  FR: { name: 'France',     lang: 'fr' },
  IT: { name: 'Italie',     lang: 'it' },
  ES: { name: 'Espagne',    lang: 'es' },
  GB: { name: 'Angleterre', lang: 'en' },
  DE: { name: 'Allemagne',  lang: 'de' },
  PT: { name: 'Portugal',   lang: 'pt' },
};

const LANG_LABEL: Record<string, string> = { fr: 'Français', it: 'Italiano', es: 'Español', en: 'English', de: 'Deutsch', pt: 'Português' };

function countryName(country?: string | null) {
  if (!country) return null;
  return COUNTRY_META[country.toUpperCase()]?.name || country;
}

// Use flagcdn.com SVG flags — Windows doesn't ship colored flag-emoji fonts so
// the unicode 🇪🇸 sequence falls back to "ES" text. The CDN is free, no key,
// no rate limit, ~600 bytes per flag SVG, served with long cache headers.
function Flag({ country, className = '' }: { country?: string | null; className?: string }) {
  if (!country) return null;
  const code = country.toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt={countryName(country) || code}
      loading="lazy"
      className={cn('inline-block object-cover rounded-[2px]', className)}
    />
  );
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
  /** Currently-displayed title (original or translated) */
  displayTitle?: string;
  /** Currently-displayed excerpt (original or translated) */
  displayExcerpt?: string | null;
  /** If truthy, the content/title/excerpt shown is translated to this language. */
  translatedTo?: string | null;
  /** Translation in-flight indicator */
  translating?: boolean;
}

function ArticleReader({ state, onClose, onTranslate, onShowOriginal, targetLang }: {
  state: ReaderState;
  onClose: () => void;
  onTranslate: () => void;
  onShowOriginal: () => void;
  targetLang: string;
}) {
  const [imgError, setImgError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const { item, content, loading, error, fallback_url, translatedTo, translating } = state;
  const isBuzz = item.type === 'buzz';
  const isEditorial = item.type === 'editorial';
  const displayTitle   = state.displayTitle   ?? item.title;
  const displayExcerpt = state.displayExcerpt ?? item.excerpt;
  // Translation only makes sense for foreign-press articles whose language differs from the user's target.
  const canTranslate = item.type === 'article' && !!item.lang && item.lang !== targetLang;

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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {item.country && (
              <Badge variant="outline" className="text-[10px] gap-1.5 pl-1" title={countryName(item.country) || undefined}>
                <Flag country={item.country} className="w-4 h-3" />
                {countryName(item.country)}
              </Badge>
            )}
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
            {canTranslate && (
              translatedTo ? (
                <Button
                  variant="outline" size="sm"
                  onClick={onShowOriginal}
                  className="h-7 gap-1.5 text-[11px]"
                  title={`Voir en ${LANG_LABEL[item.lang || ''] || item.lang}`}
                >
                  <Globe className="w-3.5 h-3.5" /> Original
                </Button>
              ) : (
                <Button
                  variant="default" size="sm"
                  onClick={onTranslate}
                  disabled={translating}
                  className="h-7 gap-1.5 text-[11px]"
                  title={`Traduire en ${LANG_LABEL[targetLang] || targetLang}`}
                >
                  {translating
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Languages className="w-3.5 h-3.5" />}
                  Traduire
                </Button>
              )
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
              {translatedTo && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <Languages className="w-3 h-3" /> Traduit ({LANG_LABEL[translatedTo] || translatedTo})
                </Badge>
              )}
            </div>

            {/* Title */}
            <h1 className={cn('font-black leading-tight tracking-tight', isBuzz ? 'text-lg' : 'text-2xl')}>
              {displayTitle}
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
            ) : displayExcerpt ? (
              /* No full content yet — show excerpt + load button */
              <div className="space-y-4">
                <p className="text-sm text-foreground/80 leading-relaxed">{displayExcerpt}</p>
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
        {/* Country flag overlay (top-right) — only on press articles */}
        {item.country && !isBuzz && (
          <div
            className="absolute top-2.5 right-2.5 bg-background/85 backdrop-blur-sm rounded-md p-1 leading-none shadow-sm"
            title={countryName(item.country) || undefined}
          >
            <Flag country={item.country} className="w-5 h-[14px] block" />
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
  const { t, i18n } = useTranslation();
  const { data: isAdmin } = useIsAdmin();
  const navigate = useNavigate();
  const { autoTranslateNews, setAutoTranslateNews } = useUiPreferences();

  // Translation target = current UI language (fallback to FR). Drives the
  // "Traduire en …" button label and the request to /api/news/translate.
  const i18nLang = (i18n.language || 'fr').slice(0, 2).toLowerCase();
  const targetLang = (['fr','en','es','de','it','pt'].includes(i18nLang) ? i18nLang : 'fr');

  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reader, setReader]     = useState<ReaderState | null>(null);

  const {
    data,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<UnifiedResponse>({
    queryKey: [
      'news-unified',
      search, category, typeFilter,
      selectedCountries.join(','),
      autoTranslateNews ? targetLang : '',
    ],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
        ...(search     ? { search }     : {}),
        ...(category   ? { category }   : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(selectedCountries.length ? { countries: selectedCountries.join(',') } : {}),
        // Auto-translate ON ⇒ ask the server to swap cached translations into
        // the listing. Server does NOT call DeepL from /news/unified, so this
        // is free — only articles previously opened-and-translated swap.
        ...(autoTranslateNews ? { translate: targetLang } : {}),
      });
      const res = await fetch(`${API}/news/unified?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur chargement actualités');
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + (p.items?.length || 0), 0);
      if (!lastPage || loaded >= (lastPage.total || 0)) return undefined;
      return loaded;
    },
    initialPageParam: 0,
    staleTime: 3 * 60 * 1000,
  });

  // ── IntersectionObserver sentinel for infinite scroll ─────────────────────
  // Mirrors the pattern used by /players. Ref-based state captures lets the
  // observer fire without recreating the callback on every render.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const hasNextPageRef = useRef(false);
  const isFetchingRef = useRef(false);
  useEffect(() => { hasNextPageRef.current = !!hasNextPage; }, [hasNextPage]);
  useEffect(() => { isFetchingRef.current = !!isFetchingNextPage; }, [isFetchingNextPage]);

  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasNextPageRef.current && !isFetchingRef.current) {
        fetchNextPage();
      }
    }, { rootMargin: '400px' });
    observer.observe(node);
    observerRef.current = observer;
  }, [fetchNextPage]);

  const openReader = useCallback(async (item: UnifiedItem) => {
    // Editorial articles → full dedicated page with reactions & share
    if (item.type === 'editorial') {
      navigate(`/editorial/${item.id}`);
      return;
    }

    // Buzz posts: content is already in DB
    if (item.type === 'buzz') {
      setReader({
        item, content: item.excerpt, loading: false, error: null, fallback_url: item.url,
        displayTitle: item.title, displayExcerpt: item.excerpt, translatedTo: null,
      });
      return;
    }

    // For foreign-language articles, auto-translate when the user has opted
    // in. We pass `?translate=<lang>` so the server returns translated title
    // + excerpt + content in one round-trip (this is the only path that
    // actually consumes DeepL quota — listing only swaps cached strings).
    const shouldAutoTranslate = autoTranslateNews && item.type === 'article'
      && !!item.lang && item.lang !== targetLang;
    const contentUrl = shouldAutoTranslate
      ? `${API}/news/content/${item.id}?translate=${targetLang}`
      : `${API}/news/content/${item.id}`;

    setReader({
      item, content: null, loading: true, error: null, fallback_url: null,
      displayTitle: item.title, displayExcerpt: item.excerpt, translatedTo: null,
    });

    try {
      const res = await fetch(contentUrl, { credentials: 'include' });
      const d = await res.json();
      const translated = !!d.translated;
      setReader({
        item,
        content:        d.content || null,
        loading:        false,
        error:          null,
        fallback_url:   d.content ? null : (d.fallback_url || item.url),
        displayTitle:   translated ? (d.title  || item.title)   : item.title,
        displayExcerpt: translated ? (d.excerpt || item.excerpt) : item.excerpt,
        translatedTo:   translated ? targetLang : null,
      });
    } catch {
      setReader({
        item, content: null, loading: false, error: 'Impossible de charger le contenu.', fallback_url: item.url,
        displayTitle: item.title, displayExcerpt: item.excerpt, translatedTo: null,
      });
    }
  }, [navigate, autoTranslateNews, targetLang]);

  // ── Translate current article in the reader to `targetLang` ────────────────
  const handleTranslate = useCallback(async () => {
    if (!reader) return;
    const { item } = reader;
    if (!item.lang || item.lang === targetLang) return;
    setReader(r => r ? { ...r, translating: true } : r);
    try {
      const res = await fetch(`${API}/news/translate/${item.id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: targetLang }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.hint || d.error || 'Traduction indisponible');
        setReader(r => r ? { ...r, translating: false } : r);
        return;
      }
      setReader(r => r ? {
        ...r,
        translating: false,
        translatedTo: targetLang,
        displayTitle:  d.title || r.item.title,
        displayExcerpt: d.description || r.item.excerpt,
        content: d.content || r.content,
      } : r);
    } catch (err) {
      toast.error('Erreur lors de la traduction');
      setReader(r => r ? { ...r, translating: false } : r);
    }
  }, [reader, targetLang]);

  const handleShowOriginal = useCallback(async () => {
    if (!reader) return;
    // Reload the original content
    const { item } = reader;
    setReader(r => r ? { ...r, translating: true } : r);
    try {
      const res = await fetch(`${API}/news/content/${item.id}`, { credentials: 'include' });
      const d = await res.json();
      setReader(r => r ? {
        ...r,
        translating: false,
        translatedTo: null,
        displayTitle: item.title,
        displayExcerpt: item.excerpt,
        content: d.content || r.content,
      } : r);
    } catch {
      setReader(r => r ? {
        ...r,
        translating: false,
        translatedTo: null,
        displayTitle: item.title,
        displayExcerpt: item.excerpt,
      } : r);
    }
  }, [reader]);

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

  // Flatten paginated items. First page also carries the facet aggregates
  // (categories, countries, total) — those stay constant across pages.
  const items         = (data?.pages || []).flatMap(p => p.items || []);
  const total         = data?.pages?.[0]?.total ?? 0;
  const categories    = data?.pages?.[0]?.categories || [];
  const countryFacets = data?.pages?.[0]?.countries  || [];
  const featured      = items[0];
  const rest          = items.slice(1);
  const hasFilters    = !!(search || category || typeFilter || selectedCountries.length);

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const clearFilters = () => {
    setSearch(''); setCategory(''); setTypeFilter('');
    setSelectedCountries([]);
  };

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
            Presse internationale · Football Buzz · Éditorial
            {total ? ` · ${total} résultat${total > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Auto-translate toggle — drives ?translate=<lang> on listing + reader */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <Languages className="w-3.5 h-3.5" />
            <span>Traduire en {LANG_LABEL[targetLang] || targetLang}</span>
            <Switch
              checked={autoTranslateNews}
              onCheckedChange={setAutoTranslateNews}
              aria-label="Traduction automatique"
            />
          </label>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
              {refreshing ? 'Scraping…' : 'Actualiser'}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" className="pl-9" />
        </div>

        {/* Type toggle */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          {([['', 'Tous'], ['article', 'Presse'], ['buzz', 'Buzz'], ['editorial', 'Éditorial']] as [TypeFilter, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setTypeFilter(v)}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all',
                typeFilter === v ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {v === 'buzz' && <Zap className="w-3 h-3 inline mr-1 text-orange-500" />}
              {v === 'editorial' && <PenLine className="w-3 h-3 inline mr-1 text-primary" />}
              {label}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <Select value={category} onValueChange={v => setCategory(v === '_all' ? '' : v)}>
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

      {/* Country chips — one row showing every country we have content for */}
      {countryFacets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1">
            <Globe className="w-3 h-3" /> Pays:
          </span>
          {countryFacets.map(c => {
            const meta = COUNTRY_META[c.country];
            if (!meta) return null;
            const active = selectedCountries.includes(c.country);
            return (
              <button
                key={c.country}
                type="button"
                onClick={() => toggleCountry(c.country)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-1 text-[11px] transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50'
                )}
                title={meta.name}
              >
                <Flag country={c.country} className="w-4 h-3" />
                <span className="font-medium">{meta.name}</span>
                <span className={cn('text-[10px]', active ? 'opacity-80' : 'opacity-60')}>{c.count}</span>
              </button>
            );
          })}
          {selectedCountries.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedCountries([])}
              className="ml-1 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              tout
            </button>
          )}
        </div>
      )}

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
          {/* Featured — only when no filters are active */}
          {!hasFilters && featured && (
            <FeaturedCard item={featured} onClick={() => openReader(featured)} />
          )}

          {/* Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {(hasFilters ? items : rest).map(item => (
              <ItemCard key={item.id} item={item} onClick={() => openReader(item)} />
            ))}
          </div>

          {/* Infinite scroll sentinel — fires fetchNextPage when in view */}
          {hasNextPage && (
            <div ref={sentinelCallbackRef} className="flex justify-center py-6">
              {isFetchingNextPage ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement des articles suivants…
                </div>
              ) : (
                <div className="h-px" />
              )}
            </div>
          )}

          {!hasNextPage && items.length > 12 && (
            <p className="text-center text-[11px] text-muted-foreground/60 py-4">
              — Fin des résultats —
            </p>
          )}
        </>
      )}

      {isAdmin && !isLoading && items.length === 0 && (
        <p className="text-xs text-muted-foreground/60 text-center">
          Variable <code className="bg-muted px-1 rounded">APIFY_API_KEY</code> requise dans <code className="bg-muted px-1 rounded">.env</code> pour le scraping automatique.
        </p>
      )}

      {/* Inline article reader */}
      {reader && (
        <ArticleReader
          state={reader}
          onClose={() => setReader(null)}
          onTranslate={handleTranslate}
          onShowOriginal={handleShowOriginal}
          targetLang={targetLang}
        />
      )}
    </div>
  );
}
