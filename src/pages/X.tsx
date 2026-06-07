import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Flame, RefreshCw, ExternalLink, Settings2,
  Heart, Repeat2, MessageCircle, Twitter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');
const DEFAULT_ACCOUNTS = ['L_Equipe', 'RMCsport', 'FabrizioRomano', 'TransfermarktDE', 'SkySportsPL'];
const DEFAULT_KEYWORDS = ['transfert football', 'scouting football', 'mercato'];
const X_CONFIG_KEY = 'scouthub-x-config';

interface XPost {
  id: string; source_name: string; source_handle: string; content: string;
  image_url: string | null; external_url: string; buzz_score: number;
  retweet_count: number; reply_count: number; is_hot: number;
  published_at: string; verified: boolean; profile_image: string | null;
}
interface XFeedResponse { posts: XPost[]; total: number; query: string }
interface XConfig { accounts: string[]; keywords: string[] }

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

function formatNum(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function loadXConfig(): XConfig {
  try {
    const raw = localStorage.getItem(X_CONFIG_KEY);
    if (!raw) return { accounts: DEFAULT_ACCOUNTS, keywords: DEFAULT_KEYWORDS };
    return { ...{ accounts: DEFAULT_ACCOUNTS, keywords: DEFAULT_KEYWORDS }, ...JSON.parse(raw) };
  } catch { return { accounts: DEFAULT_ACCOUNTS, keywords: DEFAULT_KEYWORDS }; }
}

function saveXConfig(cfg: XConfig) {
  localStorage.setItem(X_CONFIG_KEY, JSON.stringify(cfg));
}

function TwitterWidgetEmbed({ query }: { query: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const anchor = document.createElement('a');
    anchor.className = 'twitter-timeline';
    anchor.setAttribute('data-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    anchor.setAttribute('data-lang', 'fr');
    anchor.setAttribute('data-height', '600');
    anchor.setAttribute('data-chrome', 'noheader nofooter noborders');
    anchor.href = `https://twitter.com/search?q=${encodeURIComponent(query)}&f=live`;
    anchor.textContent = `Posts X — ${query}`;
    containerRef.current.appendChild(anchor);

    if ((window as any).twttr?.widgets) {
      (window as any).twttr.widgets.load(containerRef.current);
    } else {
      const existing = document.getElementById('twitter-wjs');
      if (!existing) {
        const script = document.createElement('script');
        script.id = 'twitter-wjs';
        script.src = 'https://platform.twitter.com/widgets.js';
        script.async = true;
        document.head.appendChild(script);
        script.onload = () => (window as any).twttr?.widgets?.load(containerRef.current);
      } else {
        (window as any).twttr?.widgets?.load(containerRef.current);
      }
    }

    return () => { containerRef.current && (containerRef.current.innerHTML = ''); };
  }, [query]);

  return <div ref={containerRef} className="w-full min-h-[400px] flex items-start justify-center pt-2" />;
}

function XCard({ post }: { post: XPost }) {
  const isHot = post.is_hot === 1 || post.buzz_score > 500;
  return (
    <a href={post.external_url} target="_blank" rel="noopener noreferrer"
      className={cn('group block rounded-2xl border transition-all duration-200 hover:shadow-lg hover:-translate-y-px',
        isHot ? 'border-sky-500/30 bg-gradient-to-br from-sky-500/5 to-blue-500/5 hover:border-sky-500/50'
               : 'border-border/60 bg-card hover:border-sky-400/30')}>
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          {post.profile_image ? (
            <img src={post.profile_image} alt={post.source_name} className="w-9 h-9 rounded-full object-cover shrink-0 bg-muted" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          ) : (
            <div className="w-9 h-9 rounded-full bg-sky-500/20 flex items-center justify-center shrink-0">
              <Twitter className="w-4 h-4 text-sky-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold truncate">{post.source_name}</span>
              {post.verified && <span className="text-sky-500 text-xs">✓</span>}
              {isHot && <Flame className="w-3.5 h-3.5 text-orange-500 shrink-0" />}
            </div>
            <span className="text-xs text-muted-foreground">{post.source_handle}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[11px] text-muted-foreground">{timeAgo(post.published_at)}</span>
            <ExternalLink className="w-3 h-3 text-muted-foreground/40 group-hover:text-sky-500 transition-colors" />
          </div>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90 mb-3 line-clamp-4">{post.content}</p>
        {post.image_url && (
          <div className="rounded-xl overflow-hidden mb-3 border border-border/40">
            <img src={post.image_url} alt="" className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{formatNum(post.buzz_score)}</span>
          <span className="flex items-center gap-1"><Repeat2 className="w-3 h-3" />{formatNum(post.retweet_count)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{formatNum(post.reply_count)}</span>
          {isHot && <Badge className="text-[9px] gap-1 bg-sky-500/15 text-sky-600 border-0 px-2 ml-auto"><Flame className="w-2.5 h-2.5" /> Hot</Badge>}
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

function XConfigPanel({ config, onSave }: { config: XConfig; onSave: (c: XConfig) => void }) {
  const [accounts, setAccounts] = useState(config.accounts.join(', '));
  const [keywords, setKeywords] = useState(config.keywords.join(', '));

  const handleSave = () => {
    const a = accounts.split(',').map(s => s.trim().replace(/^@/, '')).filter(Boolean);
    const k = keywords.split(',').map(s => s.trim()).filter(Boolean);
    onSave({ accounts: a, keywords: k });
  };

  return (
    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
      <p className="text-xs font-semibold text-sky-600 flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Configuration du fil X</p>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Comptes à suivre (séparés par virgule)</label>
        <Input value={accounts} onChange={e => setAccounts(e.target.value)} placeholder="L_Equipe, FabrizioRomano, TransfermarktDE" className="h-8 text-xs" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Mots-clés (séparés par virgule)</label>
        <Input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="transfert football, mercato, scouting" className="h-8 text-xs" />
      </div>
      <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleSave}>Enregistrer</Button>
    </div>
  );
}

export default function XPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [xConfig, setXConfig] = useState<XConfig>(loadXConfig);
  const [showXConfig, setShowXConfig] = useState(false);

  const handleSaveXConfig = useCallback((c: XConfig) => {
    setXConfig(c);
    saveXConfig(c);
    setShowXConfig(false);
    qc.invalidateQueries({ queryKey: ['x-feed'] });
  }, [qc]);

  const { data: xData, isLoading: xLoading, error: xError, isFetching: xFetching } = useQuery<XFeedResponse>({
    queryKey: ['x-feed', xConfig.accounts.join(','), xConfig.keywords.join(',')],
    queryFn: async () => {
      const params = new URLSearchParams({
        accounts: xConfig.accounts.join(','),
        keywords: xConfig.keywords.join(','),
        limit: '30',
      });
      const res = await fetch(`${API}/x/feed?${params}`, { credentials: 'include' });
      if (res.status === 402) return null as any;
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30 * 60_000,
    retry: false,
  });

  const hasXKey = xData !== null && !((xError as any)?.message?.includes('no_key'));
  const xPosts = xData?.posts ?? [];
  const widgetQuery = [...xConfig.accounts.map(a => `from:${a}`), ...xConfig.keywords].join(' OR ') || 'football scouting';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
            <Twitter className="w-5 h-5 text-sky-500" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('x.title')}</h1>
            <p className="text-xs text-muted-foreground">{t('x.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowXConfig(v => !v)} className="rounded-xl gap-1.5 text-xs">
            <Settings2 className="w-3.5 h-3.5" /> Config X
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['x-feed'] })}
            disabled={xFetching}
            className="rounded-xl gap-1.5 text-xs">
            <RefreshCw className={cn('w-3.5 h-3.5', xFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {showXConfig && (
        <div className="mb-4">
          <XConfigPanel config={xConfig} onSave={handleSaveXConfig} />
        </div>
      )}

      {/* No key → official widget */}
      {!hasXKey && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl border border-sky-500/20 bg-sky-500/5">
            <Twitter className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Consultez X directement dans Scouty</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Le fil ci-dessous affiche les posts X correspondant à vos comptes et mots-clés configurés.
                Pour un fil personnalisé avec métriques réelles, connectez votre clé{' '}
                <Link to="/settings" className="text-sky-600 hover:underline font-medium">SocialData dans Paramètres →</Link>
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {xConfig.accounts.map(a => (
                  <Badge key={a} variant="outline" className="text-[10px] border-sky-500/30 text-sky-600">@{a}</Badge>
                ))}
                {xConfig.keywords.map(k => (
                  <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
            <div className="px-4 pt-3 pb-2 border-b border-border/40 flex items-center gap-2">
              <Twitter className="w-4 h-4 text-sky-500" />
              <span className="text-sm font-semibold">Fil X live</span>
              <span className="text-xs text-muted-foreground ml-auto opacity-60">via widgets.twitter.com</span>
            </div>
            <div className="p-3">
              <TwitterWidgetEmbed query={widgetQuery} />
            </div>
          </div>
        </div>
      )}

      {/* Has key → API posts */}
      {hasXKey && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              SocialData connecté · {xPosts.length} posts
            </div>
            <div className="flex flex-wrap gap-1">
              {xConfig.accounts.slice(0, 4).map(a => (
                <Badge key={a} variant="outline" className="text-[10px] border-sky-500/20 text-sky-600">@{a}</Badge>
              ))}
              {xConfig.accounts.length > 4 && <Badge variant="outline" className="text-[10px]">+{xConfig.accounts.length - 4}</Badge>}
            </div>
          </div>
          {xLoading ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : xPosts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              <Twitter className="w-10 h-10 mx-auto mb-3 opacity-20" />
              Aucun post trouvé pour cette configuration.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {xPosts.map(p => <XCard key={p.id} post={p} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
