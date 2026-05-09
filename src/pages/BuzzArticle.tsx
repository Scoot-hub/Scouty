import { useState, useEffect } from 'react';
import { useSearchParams, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ExternalLink, AlertCircle, Flame, Globe, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

const LANG_NAMES: Record<string, string> = {
  fr: 'français', en: 'English', es: 'español', de: 'Deutsch',
  pt: 'português', it: 'italiano', nl: 'Nederlands', ar: 'العربية',
};

interface ArticleData {
  title: string;
  description: string;
  image: string | null;
  paragraphs: string[];
  source_url: string;
  lang: string | null;
}

interface BuzzPost {
  id: string; source_name: string; source_handle: string; source_color: string;
  content: string; image_url: string | null; external_url: string;
  buzz_score: number; is_hot: number; published_at: string; scraped_at: string;
}

function timeAgo(dateStr: string, locale = 'fr') {
  try {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (diff < 60) return rtf.format(-Math.floor(diff), 'second');
    if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
    return rtf.format(-Math.floor(diff / 86400), 'day');
  } catch { return ''; }
}

export default function BuzzArticle() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const post = location.state?.post as BuzzPost | undefined;
  const url = params.get('url') || post?.external_url || '';
  const [translateDismissed, setTranslateDismissed] = useState(false);

  const { data, isLoading, isError } = useQuery<ArticleData>({
    queryKey: ['buzz-article', url],
    queryFn: async () => {
      const res = await fetch(`${API}/buzz/article?url=${encodeURIComponent(url)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('fetch_failed');
      return res.json();
    },
    enabled: !!url,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const isHot = post ? (post.is_hot === 1 || post.buzz_score >= 120) : false;
  const heroImage = data?.image || post?.image_url || null;
  const title = data?.title || post?.content?.split('\n')[0] || '';

  // Translate banner: article lang ≠ browser lang
  const browserLang = i18n.language.slice(0, 2);
  const articleLang = data?.lang?.slice(0, 2) ?? null;
  const showTranslateBanner = !translateDismissed && !!articleLang && articleLang !== browserLang;
  const articleLangName = articleLang ? (LANG_NAMES[articleLang] ?? articleLang.toUpperCase()) : '';
  const browserLangName = LANG_NAMES[browserLang] ?? browserLang.toUpperCase();
  const translateUrl = `https://translate.google.com/translate?sl=${articleLang}&tl=${browserLang}&u=${encodeURIComponent(url)}`;

  // Set html lang to article lang so Chrome may also offer its native translation
  useEffect(() => {
    if (!articleLang) return;
    const prev = document.documentElement.lang;
    document.documentElement.lang = articleLang;
    return () => { document.documentElement.lang = prev || browserLang; };
  }, [articleLang, browserLang]);

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Back nav */}
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
          <Link to="/buzz"><ArrowLeft className="w-4 h-4" /> {t('buzz.back')}</Link>
        </Button>
      </div>

      {/* Translate banner */}
      {showTranslateBanner && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300">
          <Globe className="w-4 h-4 shrink-0" />
          <p className="text-xs flex-1">
            Cet article est en <strong>{articleLangName}</strong>. Voulez-vous le traduire en {browserLangName} ?
          </p>
          <a
            href={translateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs font-semibold underline hover:no-underline"
          >
            Traduire
          </a>
          <button onClick={() => setTranslateDismissed(true)} className="shrink-0 p-0.5 rounded hover:bg-blue-200/60 dark:hover:bg-blue-800/50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Source badge */}
      {post && (
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 shadow-sm"
            style={{ backgroundColor: post.source_color }}
          >
            {post.source_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold">{post.source_name}</span>
              {isHot && <Flame className="w-3.5 h-3.5 text-orange-500" />}
            </div>
            <span className="text-xs text-muted-foreground">{post.source_handle} · {timeAgo(post.published_at, i18n.language)}</span>
          </div>
          <Button asChild variant="outline" size="sm" className="ml-auto gap-1.5 text-xs rounded-xl">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> {t('buzz.original_article')}
            </a>
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-52 w-full rounded-xl" />
          {[...Array(6)].map((_, i) => <Skeleton key={i} className={cn('h-4', i % 3 === 2 ? 'w-4/6' : 'w-full')} />)}
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 flex flex-col items-center gap-3 text-center">
          <AlertCircle className="w-10 h-10 text-destructive/60" />
          <p className="text-sm font-medium">{t('buzz.load_failed')}</p>
          <p className="text-xs text-muted-foreground">{t('buzz.load_failed_desc')}</p>
          <Button asChild variant="outline" size="sm" className="gap-1.5 mt-1">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> {t('buzz.read_original')}
            </a>
          </Button>
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight mb-3">{title}</h1>

          {/* Description / lead */}
          {data.description && (
            <p className="text-base text-muted-foreground leading-relaxed mb-5 border-l-4 border-primary/30 pl-4 italic">{data.description}</p>
          )}

          {/* Hero image */}
          {heroImage && (
            <div className="rounded-2xl overflow-hidden mb-6 border border-border/40">
              <img
                src={heroImage}
                alt={title}
                className="w-full max-h-80 object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}

          {/* Article body */}
          {data.paragraphs.length > 0 ? (
            <div className="prose prose-sm dark:prose-invert max-w-none space-y-4">
              {data.paragraphs.map((p, i) => (
                <p key={i} className="text-sm sm:text-base leading-relaxed text-foreground/90">{p}</p>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/40 bg-muted/30 p-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">{t('buzz.content_not_extracted')}</p>
              <Button asChild variant="default" size="sm" className="gap-1.5">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" /> {t('buzz.read_on_site', { source: post?.source_name || new URL(url).hostname })}
                </a>
              </Button>
            </div>
          )}

          {/* Footer CTA */}
          {data.paragraphs.length > 0 && (
            <div className="mt-8 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center gap-3">
              <p className="text-xs text-muted-foreground flex-1">{t('buzz.source')} : {post?.source_name || new URL(url).hostname}</p>
              <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-xl">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" /> {t('buzz.read_original_article')}
                </a>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
