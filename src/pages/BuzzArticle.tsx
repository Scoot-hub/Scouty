import { useSearchParams, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ExternalLink, AlertCircle, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface ArticleData {
  title: string;
  description: string;
  image: string | null;
  paragraphs: string[];
  source_url: string;
}

interface BuzzPost {
  id: string; source_name: string; source_handle: string; source_color: string;
  content: string; image_url: string | null; external_url: string;
  buzz_score: number; is_hot: number; published_at: string; scraped_at: string;
}

function timeAgo(dateStr: string) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'À l\'instant';
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)} jours`;
  } catch { return ''; }
}

export default function BuzzArticle() {
  const [params] = useSearchParams();
  const location = useLocation();
  const post = location.state?.post as BuzzPost | undefined;
  const url = params.get('url') || post?.external_url || '';

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

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Back nav */}
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground -ml-2">
          <Link to="/buzz"><ArrowLeft className="w-4 h-4" /> Retour au Buzz</Link>
        </Button>
      </div>

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
            <span className="text-xs text-muted-foreground">{post.source_handle} · {timeAgo(post.published_at)}</span>
          </div>
          <Button asChild variant="outline" size="sm" className="ml-auto gap-1.5 text-xs rounded-xl">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Article original
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
          <p className="text-sm font-medium">Impossible de charger l'article</p>
          <p className="text-xs text-muted-foreground">Le site source a bloqué notre accès ou l'article a été supprimé.</p>
          <Button asChild variant="outline" size="sm" className="gap-1.5 mt-1">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" /> Lire sur le site d'origine
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
              <p className="text-sm text-muted-foreground">Le contenu complet n'a pas pu être extrait.</p>
              <Button asChild variant="default" size="sm" className="gap-1.5">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" /> Lire l'article sur {post?.source_name || 'le site original'}
                </a>
              </Button>
            </div>
          )}

          {/* Footer CTA */}
          {data.paragraphs.length > 0 && (
            <div className="mt-8 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center gap-3">
              <p className="text-xs text-muted-foreground flex-1">Source : {post?.source_name || new URL(url).hostname}</p>
              <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-xl">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5" /> Lire l'article original
                </a>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
