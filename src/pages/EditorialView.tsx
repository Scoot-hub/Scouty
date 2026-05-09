import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIsAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft, Edit, Calendar, Eye, User, Tag, Share2, Check,
  ThumbsUp, ThumbsDown, Link2, Twitter, MessageSquare, Globe, X,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface Article {
  id: string;
  title: string;
  content: string;
  banner_url: string | null;
  keywords: string[] | string | null;
  status: 'draft' | 'published' | 'archived';
  views: number;
  created_at: string;
  user_id: string;
  author_name: string | null;
  author_email: string;
  author_photo: string | null;
  lang: string | null;
}

interface Reactions {
  likes: number;
  dislikes: number;
  user_reaction: 'like' | 'dislike' | null;
}

function parseKeywords(kw: string[] | string | null): string[] {
  if (!kw) return [];
  if (Array.isArray(kw)) return kw;
  try { return JSON.parse(kw); } catch { return []; }
}

function timeAgo(d: string, locale = 'fr') {
  try {
    const diff = (Date.now() - new Date(d).getTime()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (diff < 60) return rtf.format(-Math.floor(diff), 'second');
    if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
    if (diff < 2592000) return rtf.format(-Math.floor(diff / 86400), 'day');
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
  } catch { return d; }
}

const LANG_NAMES: Record<string, string> = {
  fr: 'français', en: 'English', es: 'español', de: 'Deutsch',
  pt: 'português', it: 'italiano', nl: 'Nederlands', ar: 'العربية',
};

// ── Reaction button ───────────────────────────────────────────────────────────

function ReactionButton({
  type, count, active, onClick,
}: { type: 'like' | 'dislike'; count: number; active: boolean; onClick: () => void }) {
  const Icon = type === 'like' ? ThumbsUp : ThumbsDown;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all duration-200',
        active
          ? type === 'like'
            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/15 border-red-500/40 text-red-600 dark:text-red-400'
          : 'border-border hover:bg-muted/60 text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className={cn('w-4 h-4 transition-transform', active && 'scale-110')} />
      <span className="font-mono">{count}</span>
    </button>
  );
}

// ── Share panel ───────────────────────────────────────────────────────────────

function SharePanel({ article }: { article: Article }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/share/article/${article.id}`;
  const tweetText = encodeURIComponent(`${article.title} — ${shareUrl}`);

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      toast.success(t('editorial.link_copied'));
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const nativeShare = () => {
    if (navigator.share) {
      navigator.share({ title: article.title, url: shareUrl }).catch(() => {});
    } else {
      copyLink();
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={copyLink}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Link2 className="w-3.5 h-3.5" />}
        {copied ? t('editorial.copied') : t('editorial.copy_link')}
      </button>
      <a
        href={`https://twitter.com/intent/tweet?text=${tweetText}`}
        target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-[#1d9bf0] hover:border-[#1d9bf0]/30 transition-all"
      >
        <Twitter className="w-3.5 h-3.5" /> Twitter / X
      </a>
      <button
        onClick={nativeShare}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
      >
        <Share2 className="w-3.5 h-3.5" /> {t('editorial.share')}
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EditorialView() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [translateDismissed, setTranslateDismissed] = useState(false);

  const { data: article, isLoading } = useQuery<Article>({
    queryKey: ['editorial-view', id],
    queryFn: async () => {
      const res = await fetch(`${API}/editorial/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    enabled: !!id,
    staleTime: 2 * 60_000,
  });

  // Set html lang attribute so Chrome's native translate can detect the language
  useEffect(() => {
    if (!article) return;
    const effectiveLang = article.lang ?? 'fr'; // default fr since the app is French-first
    const prev = document.documentElement.lang;
    document.documentElement.lang = effectiveLang;
    return () => { document.documentElement.lang = prev || i18n.language; };
  }, [article?.lang, article?.id, i18n.language]);

  const { data: reactions } = useQuery<Reactions>({
    queryKey: ['editorial-reactions', id],
    queryFn: async () => {
      const res = await fetch(`${API}/editorial/${id}/reactions`, { credentials: 'include' });
      if (!res.ok) return { likes: 0, dislikes: 0, user_reaction: null };
      return res.json();
    },
    enabled: !!id && !!user,
    staleTime: 30_000,
  });

  const reactMutation = useMutation({
    mutationFn: async (reaction: 'like' | 'dislike') => {
      const res = await fetch(`${API}/editorial/${id}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reaction }),
      });
      if (!res.ok) throw new Error('Erreur');
      return res.json();
    },
    onSuccess: (data) => {
      qc.setQueryData(['editorial-reactions', id], data);
    },
    onError: () => toast.error(t('common.error')),
  });

  if (isLoading) return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-56 w-full rounded-2xl" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!article) return (
    <div className="max-w-3xl mx-auto text-center py-20">
      <p className="text-muted-foreground">{t('editorial.not_found')}</p>
      <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate('/editorial')}>
        <ChevronLeft className="w-4 h-4 mr-2" />{t('editorial.back')}
      </Button>
    </div>
  );

  const kw = parseKeywords(article.keywords);
  const canEdit = article.user_id === user?.id || isAdmin;
  const authorName = article.author_name || article.author_email;
  const r = reactions ?? { likes: 0, dislikes: 0, user_reaction: null };
  const totalReactions = r.likes + r.dislikes;
  const likeRatio = totalReactions > 0 ? Math.round((r.likes / totalReactions) * 100) : null;

  const browserLang = i18n.language.slice(0, 2);
  // Assume French when lang is not set (app is French-first)
  const effectiveLang = article.lang ?? 'fr';
  // Show banner whenever the article language differs from the UI language
  const showTranslateBanner = !translateDismissed && effectiveLang !== browserLang;
  const articleLangName = LANG_NAMES[effectiveLang] ?? effectiveLang.toUpperCase();
  const browserLangName = LANG_NAMES[browserLang] ?? browserLang.toUpperCase();
  // Use the public share URL so Google Translate can actually fetch the content
  const shareUrl = `${window.location.origin}/share/article/${article.id}`;
  const translateUrl = `https://translate.google.com/translate?sl=${effectiveLang}&tl=${browserLang}&u=${encodeURIComponent(shareUrl)}`;


  return (
    <div className="max-w-3xl mx-auto pb-16">
      {/* Nav */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" className="rounded-xl gap-2 -ml-2" onClick={() => navigate(-1)}>
          <ChevronLeft className="w-4 h-4" />{t('editorial.back')}
        </Button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={() => navigate(`/editorial/${id}/edit`)}>
              <Edit className="w-4 h-4" />{t('editorial.edit')}
            </Button>
          )}
        </div>
      </div>

      {/* Translate banner */}
      {showTranslateBanner && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300">
          <Globe className="w-4 h-4 shrink-0" />
          <p className="text-xs flex-1">
            {t('editorial.translate_offer', { lang: articleLangName })}
          </p>
          <a
            href={translateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {t('editorial.translate_with_google', { lang: browserLangName })}
          </a>
          <button onClick={() => setTranslateDismissed(true)} className="shrink-0 p-0.5 rounded hover:bg-blue-200/60 dark:hover:bg-blue-800/50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Draft badge */}
      {article.status !== 'published' && (
        <Badge variant="secondary" className="mb-4">
          {article.status === 'draft' ? t('editorial.status_draft') : t('editorial.status_archived')}
        </Badge>
      )}

      {/* Banner */}
      {article.banner_url && (
        <div className="rounded-2xl overflow-hidden mb-8 shadow-lg">
          <img src={article.banner_url} alt={article.title} className="w-full max-h-80 object-cover" />
        </div>
      )}

      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight mb-5">{article.title}</h1>

      {/* Author card */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-2xl bg-muted/30 border border-border/50">
        {article.author_photo ? (
          <img src={article.author_photo} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-6 h-6 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{authorName}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{timeAgo(article.created_at, i18n.language)}</span>
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{t('editorial.views', { count: article.views })}</span>
            {totalReactions > 0 && likeRatio !== null && (
              <span className="flex items-center gap-1 text-emerald-500">
                <ThumbsUp className="w-3 h-3" />{likeRatio}{t('editorial.positive_pct')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Keywords */}
      {kw.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {kw.map(k => (
            <span key={k} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">
              <Tag className="w-3 h-3" />{k}
            </span>
          ))}
        </div>
      )}

      <hr className="border-border/50 mb-8" />

      {/* Rich text content */}
      <div
        className="prose prose-sm dark:prose-invert max-w-none
          prose-headings:font-bold prose-headings:tracking-tight
          prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
          prose-a:text-primary prose-a:underline
          prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:italic
          prose-img:rounded-xl prose-img:shadow-md
          prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          mb-12"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />

      {/* ── Reactions & Share ─────────────────────────────────── */}
      {article.status === 'published' && (
        <div className="border-t border-border/50 pt-8 space-y-6">

          {/* Reactions */}
          <div>
            <p className="text-sm font-semibold mb-3 text-muted-foreground">
              {user ? t('editorial.your_opinion') : t('editorial.sign_in_to_react')}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {user ? (
                <>
                  <ReactionButton
                    type="like"
                    count={r.likes}
                    active={r.user_reaction === 'like'}
                    onClick={() => reactMutation.mutate('like')}
                  />
                  <ReactionButton
                    type="dislike"
                    count={r.dislikes}
                    active={r.user_reaction === 'dislike'}
                    onClick={() => reactMutation.mutate('dislike')}
                  />
                  {r.user_reaction && (
                    <span className="text-xs text-muted-foreground">
                      {r.user_reaction === 'like' ? t('editorial.liked_article') : t('editorial.disliked_article')}
                    </span>
                  )}
                </>
              ) : (
                <Link to="/auth">
                  <Button variant="outline" size="sm" className="rounded-xl gap-2">
                    <ThumbsUp className="w-4 h-4" /> {t('editorial.sign_in_to_react')}
                  </Button>
                </Link>
              )}
            </div>

            {/* Reaction bar */}
            {totalReactions > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${likeRatio}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {t('editorial.reaction_count', { count: totalReactions })}
                </span>
              </div>
            )}
          </div>

          {/* Share */}
          <div>
            <p className="text-sm font-semibold mb-3 text-muted-foreground">{t('editorial.share_article')}</p>
            <SharePanel article={article} />
          </div>

          {/* Comments nudge */}
          <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              {t('editorial.comments_coming_soon')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
