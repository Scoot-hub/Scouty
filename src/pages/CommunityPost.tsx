import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPremium } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Heart, MessageCircle, Eye, Send, Globe, X,
  HelpCircle, Lightbulb, Trophy, Users, MessageSquare,
  User, Calendar, ExternalLink, CheckCircle2, Lock, Building2,
} from 'lucide-react';
import { LeagueLogo } from '@/components/ui/league-logo';
import { moderateFields } from '@/lib/content-moderation';

const API = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

// ── Types ──────────────────────────────────────────────────────────────────────

type PostCategory = 'question' | 'suggestion' | 'match' | 'player' | 'general';

interface Post {
  id: string; user_id: string; author_name: string;
  category: PostCategory; title: string; content: string;
  likes: number; replies_count: number; views: number;
  is_pinned: boolean; is_archived?: boolean; is_closed?: boolean;
  accepted_reply_id?: string | null; created_at: string;
  lang?: string | null; country?: string | null;
}

interface Reply {
  id: string; post_id: string; user_id: string | null;
  author_name: string; content: string; created_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  fr: 'français', en: 'English', es: 'español', de: 'Deutsch',
  pt: 'português', it: 'italiano', nl: 'Nederlands', ar: 'العربية',
};

const CATEGORY_ICON: Record<PostCategory, typeof MessageSquare> = {
  question: HelpCircle, suggestion: Lightbulb, match: Trophy,
  player: Users, general: MessageSquare,
};

const CATEGORY_COLOR: Record<PostCategory, string> = {
  question: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  suggestion: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
  match: 'text-violet-600 bg-violet-500/10 border-violet-500/20',
  player: 'text-sky-600 bg-sky-500/10 border-sky-500/20',
  general: 'text-primary bg-primary/10 border-primary/20',
};

// ── Content renderer (shared with Community.tsx) ──────────────────────────────

function PlayerTag({ name, playerId }: { name: string; playerId: string }) {
  return (
    <Link to={`/player/${playerId}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-[12px] font-semibold hover:bg-purple-500/20 transition-colors no-underline align-baseline">
      <Users className="w-3 h-3 shrink-0" />{name}
    </Link>
  );
}

function ClubTag({ name }: { name: string }) {
  return (
    <Link to={`/club?club=${encodeURIComponent(name)}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[12px] font-semibold hover:bg-blue-500/20 transition-colors no-underline align-baseline">
      <Building2 className="w-3 h-3 shrink-0" />{name}
    </Link>
  );
}

function ChampTag({ name }: { name: string }) {
  return (
    <Link to="/championships"
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[12px] font-semibold hover:bg-amber-500/20 transition-colors no-underline align-baseline">
      <LeagueLogo league={name} size="xs" />{name}
    </Link>
  );
}

function MentionLink({ name, userId }: { name: string; userId: string }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<{ photo_url?: string | null; full_name?: string | null; first_name?: string | null; last_name?: string | null; role?: string | null } | null>(null);
  const loadingRef = useRef(false);

  const fetchProfile = useCallback(async () => {
    if (profile || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const r = await fetch(`${API}/profile/user/${encodeURIComponent(userId)}`);
      if (r.ok) setProfile(await r.json());
    } catch { /* silent */ }
  }, [userId, profile]);

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button type="button" onMouseEnter={fetchProfile}
          onClick={() => navigate(`/profile/${userId}`)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[13px] font-semibold hover:bg-primary/20 transition-colors cursor-pointer align-baseline">
          <User className="w-3 h-3 shrink-0" />{name}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="p-0 overflow-hidden w-56 shadow-lg">
        {!profile ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Chargement…</div>
        ) : (
          <div className="px-3 py-3">
            <p className="text-sm font-semibold">{[profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.full_name}</p>
            {profile.role && <p className="text-[11px] text-muted-foreground capitalize">{profile.role}</p>}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function renderContent(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  const re = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|@\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, key = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) result.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    if (match[1] !== undefined) {
      result.push(<img key={key++} src={match[2]} alt={match[1] || 'image'}
        className="max-w-full rounded-lg border border-border my-2 max-h-80 object-contain"
        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />);
    } else if (match[3] !== undefined) {
      const label = match[3], url = match[4];
      if (label.startsWith('player:')) result.push(<PlayerTag key={key++} name={label.slice(7)} playerId={url} />);
      else if (label.startsWith('club:')) result.push(<ClubTag key={key++} name={label.slice(5)} />);
      else if (label.startsWith('champ:')) result.push(<ChampTag key={key++} name={label.slice(6)} />);
      else result.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity inline-flex items-center gap-0.5">
          {label}<ExternalLink className="w-3 h-3 inline shrink-0" />
        </a>
      );
    } else {
      result.push(<MentionLink key={key++} name={match[5]} userId={match[6]} />);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) result.push(<span key={key++}>{text.slice(last)}</span>);
  return result;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CommunityPost() {
  const { postId } = useParams<{ postId: string }>();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: isPremium } = useIsPremium();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [replyContent, setReplyContent] = useState('');
  const [translateDismissed, setTranslateDismissed] = useState(false);
  const [liked, setLiked] = useState(false);

  // ── Fetch post ──────────────────────────────────────────────────────────────
  const { data: post, isLoading: postLoading } = useQuery<Post | null>({
    queryKey: ['community-post', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('id', postId!)
        .single();
      if (error) return null;
      return data as unknown as Post;
    },
    enabled: !!postId,
    staleTime: 2 * 60_000,
  });

  // ── Fetch replies ───────────────────────────────────────────────────────────
  const { data: replies = [] } = useQuery<Reply[]>({
    queryKey: ['community-replies-post', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_replies')
        .select('*')
        .eq('post_id', postId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Reply[];
    },
    enabled: !!postId,
    staleTime: 60_000,
  });

  // ── Increment view count once on mount ─────────────────────────────────────
  useEffect(() => {
    if (!postId) return;
    fetch(`${API}/community/posts/${postId}/view`, { method: 'POST', credentials: 'include' }).catch(() => {});
  }, [postId]);

  // ── Check liked status ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !postId) return;
    supabase.from('community_post_likes' as any).select('id').eq('post_id', postId).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setLiked(true); })
      .catch(() => {});
  }, [user, postId]);

  // ── Like post ───────────────────────────────────────────────────────────────
  const likePost = useMutation({
    mutationFn: async () => {
      await supabase.rpc('like_community_post' as any, { p_post_id: postId, p_user_id: user!.id });
    },
    onSuccess: () => {
      setLiked(l => !l);
      qc.invalidateQueries({ queryKey: ['community-post', postId] });
    },
  });

  // ── Submit reply ────────────────────────────────────────────────────────────
  const submitReply = useMutation({
    mutationFn: async () => {
      if (!replyContent.trim()) throw new Error('empty');
      const modResult = moderateFields('', replyContent.trim());
      if (!modResult.clean) throw new Error(t('moderation.blocked'));
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', user!.id).single();
      const authorName = (profile as any)?.full_name || user!.email?.split('@')[0] || 'Scout';
      const { error } = await supabase.from('community_replies').insert({
        post_id: postId, user_id: user!.id, author_name: authorName, content: replyContent.trim(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyContent('');
      qc.invalidateQueries({ queryKey: ['community-replies-post', postId] });
      qc.invalidateQueries({ queryKey: ['community-post', postId] });
      toast.success('Réponse publiée');
    },
    onError: (err: Error) => {
      if (err.message === 'empty') return;
      toast.error(err.message || 'Erreur lors de la publication');
    },
  });

  // ── Translation ─────────────────────────────────────────────────────────────
  // Uses the user's declared app language (i18n.language), not the browser language
  const userLang = i18n.language.slice(0, 2);
  const postLang = post?.lang?.slice(0, 2) ?? null;
  const showTranslateBanner = !translateDismissed && !!postLang && postLang !== userLang;
  const postLangName = postLang ? (LANG_NAMES[postLang] ?? postLang.toUpperCase()) : '';
  const userLangName = LANG_NAMES[userLang] ?? userLang.toUpperCase();
  // For in-app content, translate the text directly via Google Translate text mode
  const translateUrl = post
    ? `https://translate.google.com/?sl=${postLang}&tl=${userLang}&text=${encodeURIComponent(post.title + '\n\n' + post.content)}&op=translate`
    : '#';

  // Set html lang to post lang so Chrome may also offer its native translation bar
  useEffect(() => {
    if (!postLang) return;
    const prev = document.documentElement.lang;
    document.documentElement.lang = postLang;
    return () => { document.documentElement.lang = prev || userLang; };
  }, [postLang, userLang]);

  // ── Loading / not found ─────────────────────────────────────────────────────
  if (postLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <p className="text-muted-foreground">Ce post n'existe pas ou a été supprimé.</p>
        <Button variant="outline" className="mt-4 gap-2" onClick={() => navigate('/community')}>
          <ArrowLeft className="w-4 h-4" /> Retour à la communauté
        </Button>
      </div>
    );
  }

  const CatIcon = CATEGORY_ICON[post.category];

  return (
    <div className="max-w-3xl mx-auto pb-12 space-y-5">

      {/* Back */}
      <Button asChild variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground hover:text-foreground">
        <Link to="/community"><ArrowLeft className="w-4 h-4" /> Communauté</Link>
      </Button>

      {/* Translate banner — based on declared app language */}
      {showTranslateBanner && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300">
          <Globe className="w-4 h-4 shrink-0" />
          <p className="text-xs flex-1">
            Ce post est rédigé en <strong>{postLangName}</strong>. Voulez-vous le traduire en {userLangName} ?
          </p>
          <a href={translateUrl} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-xs font-semibold underline hover:no-underline">
            Traduire
          </a>
          <button onClick={() => setTranslateDismissed(true)}
            className="shrink-0 p-0.5 rounded hover:bg-blue-200/60 dark:hover:bg-blue-800/50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Post card */}
      <Card className="card-warm">
        <CardContent className="pt-5 pb-4">

          {/* Meta */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {post.author_name[0]?.toUpperCase()}
            </div>
            <span className="text-sm font-semibold">{post.author_name}</span>
            <Badge variant="outline" className={cn('text-[10px] gap-1', CATEGORY_COLOR[post.category])}>
              <CatIcon className="w-3 h-3" />
              {t(`community.cat_${post.category}`, { defaultValue: post.category })}
            </Badge>
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <Calendar className="w-3 h-3" />{formatDate(post.created_at)}
            </span>
            {post.is_closed && (
              <Badge variant="secondary" className="text-[10px] gap-1 text-amber-600">
                <Lock className="w-3 h-3" /> Clos
              </Badge>
            )}
          </div>

          {/* Title */}
          <h1 className="text-xl font-extrabold tracking-tight leading-snug mb-3">{post.title}</h1>

          {/* Content */}
          <div className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
            {renderContent(post.content)}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-5 pt-4 border-t border-border/40">
            <button
              onClick={() => user && likePost.mutate()}
              disabled={!user || likePost.isPending}
              className={cn('flex items-center gap-1.5 text-sm transition-colors select-none',
                liked ? 'text-rose-500 font-semibold' : 'text-muted-foreground hover:text-rose-400',
                !user && 'cursor-default opacity-50')}
            >
              <Heart className={cn('w-4 h-4', liked && 'fill-rose-500 stroke-rose-500')} />
              {post.likes > 0 ? post.likes : ''}
            </button>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageCircle className="w-4 h-4" />{replies.length}
            </span>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Eye className="w-4 h-4" />{post.views}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {replies.length} réponse{replies.length > 1 ? 's' : ''}
          </h2>
          {replies.map(reply => {
            const isAccepted = post.accepted_reply_id === reply.id;
            return (
              <Card key={reply.id} className={cn('card-warm', isAccepted && 'border-green-400/40 bg-green-50/30 dark:bg-green-950/10')}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs shrink-0">
                      {reply.author_name[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold">{reply.author_name}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDate(reply.created_at)}</span>
                    {isAccepted && (
                      <Badge variant="outline" className="text-[10px] gap-1 text-green-600 border-green-400/40 ml-auto">
                        <CheckCircle2 className="w-3 h-3" /> Réponse acceptée
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-line text-foreground/85 pl-9">
                    {renderContent(reply.content)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reply form */}
      {user && isPremium && !post.is_closed && (
        <Card className="card-warm">
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Votre réponse</p>
            <Textarea
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              placeholder="Partagez votre avis ou répondez à la question…"
              className="min-h-[80px] text-sm resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply.mutate();
              }}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => submitReply.mutate()}
                disabled={submitReply.isPending || !replyContent.trim()}
                className="gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {submitReply.isPending ? 'Publication…' : 'Publier'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {user && !isPremium && (
        <Card className="card-warm border-dashed">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">Passez à Premium pour répondre aux discussions.</p>
          </CardContent>
        </Card>
      )}

      {post.is_closed && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-300 text-xs">
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Cette discussion est clôturée.
        </div>
      )}
    </div>
  );
}
