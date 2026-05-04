import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Flame, TrendingUp, Clock, RefreshCw, ExternalLink, Zap, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface BuzzPost {
  id: string; source_name: string; source_handle: string; source_color: string;
  content: string; image_url: string | null; external_url: string;
  buzz_score: number; is_hot: number; published_at: string; scraped_at: string;
}
interface BuzzResponse {
  posts: BuzzPost[]; total: number;
  sources: { source_name: string; source_handle: string; source_color: string }[];
  last_scraped: string | null;
}

function timeAgo(dateStr: string) {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'À l\'instant';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}j`;
  } catch { return ''; }
}

function BuzzCard({ post }: { post: BuzzPost }) {
  const isHot = post.is_hot === 1 || post.buzz_score >= 120;
  return (
    <a href={post.external_url} target="_blank" rel="noopener noreferrer"
      className={cn('group block rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-px',
        isHot ? 'border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-red-500/5 hover:border-orange-500/50'
               : 'border-border/60 bg-card hover:border-primary/30')}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-black shrink-0 shadow-sm" style={{ backgroundColor: post.source_color }}>
              {post.source_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold leading-none">{post.source_name}</span>
                {isHot && <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
              </div>
              <span className="text-xs text-muted-foreground">{post.source_handle}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{timeAgo(post.published_at)}</span>
            <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors" />
          </div>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90 mb-3 line-clamp-3">{post.content}</p>
        {post.image_url && (
          <div className="rounded-xl overflow-hidden mb-3 border border-border/40">
            <img src={post.image_url} alt="" className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><span>❤️</span><span>{post.buzz_score * 12}</span></span>
          <span className="flex items-center gap-1"><span>🔁</span><span>{Math.floor(post.buzz_score * 0.4)}</span></span>
          {post.buzz_score >= 140 && <Badge className="text-[9px] gap-1 bg-orange-500/15 text-orange-600 border-0 px-2 ml-auto"><Flame className="w-2.5 h-2.5" /> Trending</Badge>}
        </div>
      </div>
    </a>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/40 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2.5"><Skeleton className="w-9 h-9 rounded-full" /><div className="space-y-1.5"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-3 w-16" /></div></div>
      <Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-5/6" /><Skeleton className="h-3.5 w-4/6" />
    </div>
  );
}

export default function Buzz() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [buzzFilter, setBuzzFilter] = useState<'trending' | 'recent' | 'hot'>('trending');
  const [buzzSource, setBuzzSource] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: buzzData, isLoading: buzzLoading, isFetching: buzzFetching } = useQuery<BuzzResponse>({
    queryKey: ['buzz', buzzFilter, buzzSource],
    queryFn: async () => {
      const params = new URLSearchParams({ filter: buzzFilter, limit: '40' });
      if (buzzSource) params.set('source', buzzSource);
      const res = await fetch(`${API}/buzz?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 90_000,
    refetchInterval: autoRefresh ? 120_000 : false,
  });

  useEffect(() => {
    if (!autoRefresh) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => { qc.invalidateQueries({ queryKey: ['buzz'] }); }, 120_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, qc]);

  const buzzPosts = buzzData?.posts ?? [];
  const buzzSources = buzzData?.sources ?? [];

  const FILTERS = [
    { value: 'trending' as const, label: t('buzz.filter_trending'), icon: TrendingUp },
    { value: 'hot' as const,      label: t('buzz.filter_hot'),      icon: Flame },
    { value: 'recent' as const,   label: t('buzz.filter_recent'),   icon: Clock },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight">{t('buzz.title')}</h1>
              {autoRefresh && (
                <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
                  <Radio className="w-3 h-3 animate-pulse" /> Live
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('buzz.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'} size="sm"
            onClick={() => setAutoRefresh(v => !v)} className="rounded-xl gap-1.5 text-xs">
            <Radio className={cn('w-3.5 h-3.5', autoRefresh && 'animate-pulse')} />
            {autoRefresh ? 'Live' : 'Pausé'}
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['buzz'] })}
            disabled={buzzFetching}
            className="rounded-xl gap-1.5 text-xs">
            <RefreshCw className={cn('w-3.5 h-3.5', buzzFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1.5 bg-muted/40 rounded-xl p-1">
          {FILTERS.map(f => {
            const Icon = f.icon;
            return (
              <button key={f.value} onClick={() => setBuzzFilter(f.value)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  buzzFilter === f.value ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <Icon className="w-3.5 h-3.5" />{f.label}
              </button>
            );
          })}
        </div>
        {buzzSources.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setBuzzSource('')}
              className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                !buzzSource ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}>
              Tous
            </button>
            {buzzSources.map(s => (
              <button key={s.source_name}
                onClick={() => setBuzzSource(buzzSource === s.source_name ? '' : s.source_name)}
                className={cn('px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  buzzSource === s.source_name ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50')}>
                {s.source_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Posts */}
      {buzzLoading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : buzzPosts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
          {t('buzz.no_posts')}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {buzzPosts.map(p => <BuzzCard key={p.id} post={p} />)}
        </div>
      )}
    </div>
  );
}
