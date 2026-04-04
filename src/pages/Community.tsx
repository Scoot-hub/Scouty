import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPremium } from '@/hooks/use-admin';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MessageSquare, Crown, Sparkles, Send, User, Calendar, Filter,
  ThumbsUp, MessageCircle, HelpCircle, Lightbulb, Trophy, Users as UsersIcon, Heart, ExternalLink,
} from 'lucide-react';
import { moderateFields } from '@/lib/content-moderation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PostCategory = 'question' | 'suggestion' | 'match' | 'player' | 'general';

interface CommunityPost {
  id: string;
  user_id: string;
  author_name: string;
  category: PostCategory;
  title: string;
  content: string;
  likes: number;
  replies_count: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { value: PostCategory | 'all'; icon: typeof MessageSquare; color: string }[] = [
  { value: 'all', icon: Filter, color: 'text-muted-foreground' },
  { value: 'question', icon: HelpCircle, color: 'text-blue-500' },
  { value: 'suggestion', icon: Lightbulb, color: 'text-amber-500' },
  { value: 'match', icon: Trophy, color: 'text-green-500' },
  { value: 'player', icon: UsersIcon, color: 'text-purple-500' },
  { value: 'general', icon: MessageCircle, color: 'text-muted-foreground' },
];

const CATEGORY_COLORS: Record<PostCategory, string> = {
  question: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  suggestion: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  match: 'bg-green-500/10 text-green-600 border-green-500/20',
  player: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  general: 'bg-muted text-muted-foreground border-border',
};

// ---------------------------------------------------------------------------
// Mention link with profile popover
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function MentionLink({ name }: { name: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  const loadProfile = () => {
    if (loaded) return;
    setLoaded(true);
    fetch(`${API_BASE}/profile/${encodeURIComponent(name)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setProfile(d))
      .catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span ref={wrapperRef} className="relative inline">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); loadProfile(); }}
        className="text-primary font-medium hover:underline"
      >
        @{name}
      </button>
      {open && (
        <span
          className="absolute left-0 top-full mt-1 z-50 w-64 rounded-xl border border-border bg-popover shadow-xl p-4 block text-left"
          style={{ whiteSpace: 'normal' }}
          onClick={e => e.stopPropagation()}
        >
          {!profile ? (
            <span className="text-xs text-muted-foreground">{t('community.profile_loading')}</span>
          ) : (
            <span className="block space-y-3">
              <span className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                  {profile.full_name?.[0] || '?'}
                </span>
                <span className="block">
                  <span className="text-sm font-bold block">{profile.full_name}</span>
                  <span className="text-xs text-muted-foreground capitalize block">{profile.role || 'scout'}{profile.club ? ` · ${profile.club}` : ''}</span>
                </span>
              </span>
              {profile.social_public && (profile.social_x || profile.social_instagram || profile.social_linkedin) && (
                <span className="block space-y-1.5 pt-2 border-t border-border">
                  {profile.social_x && (
                    <a href={`https://x.com/${profile.social_x.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ExternalLink className="w-3 h-3" /> X: {profile.social_x}
                    </a>
                  )}
                  {profile.social_instagram && (
                    <a href={`https://instagram.com/${profile.social_instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ExternalLink className="w-3 h-3" /> Instagram: {profile.social_instagram}
                    </a>
                  )}
                  {profile.social_linkedin && (
                    <a href={profile.social_linkedin.startsWith('http') ? profile.social_linkedin : `https://${profile.social_linkedin}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ExternalLink className="w-3 h-3" /> LinkedIn
                    </a>
                  )}
                </span>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function renderWithMentions(text: string) {
  return text.split(/(@[A-Za-z\u00C0-\u024F0-9_ -]+)/g).map((part, i) =>
    part.startsWith('@')
      ? <MentionLink key={i} name={part.slice(1).trim()} />
      : <span key={i}>{part}</span>
  );
}

// Component
// ---------------------------------------------------------------------------

export default function Community() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: isPremium } = useIsPremium();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<PostCategory | 'all'>('all');
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('general');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [animatingLike, setAnimatingLike] = useState<string | null>(null);
  const [justPosted, setJustPosted] = useState<string | null>(null);
  const [postCooldown, setPostCooldown] = useState(0);
  const [replyCooldown, setReplyCooldown] = useState(0);
  const [justReplied, setJustReplied] = useState<string | null>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);

  // Cooldown timers
  useEffect(() => {
    if (postCooldown <= 0 && replyCooldown <= 0) return;
    const timer = setInterval(() => {
      setPostCooldown(v => Math.max(v - 1, 0));
      setReplyCooldown(v => Math.max(v - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [postCooldown > 0, replyCooldown > 0]);

  // --- Fetch mentionable users (with profile info for suggestions) ---
  const { data: mentionableUsers = [] } = useQuery({
    queryKey: ['community-mentionable-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_mentionable_users' as any, {});
      if (error) throw error;
      return (data || []) as { author_name: string; user_id: string | null; club: string | null; role: string | null }[];
    },
    enabled: !!isPremium,
    staleTime: 5 * 60 * 1000,
  });

  const mentionSuggestions = mentionQuery !== null
    ? mentionableUsers.filter(u => u.author_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5)
    : [];

  const handleReplyChange = useCallback((value: string) => {
    setReplyContent(value);
    const atIdx = value.lastIndexOf('@');
    if (atIdx >= 0 && (atIdx === 0 || value[atIdx - 1] === ' ')) {
      const query = value.slice(atIdx + 1);
      if (!query.includes(' ') && query.length <= 30) {
        setMentionQuery(query);
        setMentionIndex(0);
        return;
      }
    }
    setMentionQuery(null);
  }, []);

  const insertMention = useCallback((name: string) => {
    const atIdx = replyContent.lastIndexOf('@');
    if (atIdx >= 0) {
      setReplyContent(replyContent.slice(0, atIdx) + `@${name} `);
    }
    setMentionQuery(null);
    replyInputRef.current?.focus();
  }, [replyContent]);

  // --- Fetch posts ---
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['community-posts', filter],
    queryFn: async () => {
      let query = supabase
        .from('community_posts' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (filter !== 'all') {
        query = query.eq('category', filter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CommunityPost[];
    },
    enabled: !!isPremium,
  });

  // --- Fetch user's likes ---
  useQuery({
    queryKey: ['community-my-likes', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('community_likes' as any)
        .select('post_id')
        .eq('user_id', user.id);
      if (error) throw error;
      const ids = (data || []).map((r: any) => r.post_id);
      setLikedPosts(new Set(ids));
      return ids;
    },
    enabled: !!user && !!isPremium,
  });

  // --- Fetch replies for ALL posts ---
  const postIds = posts.map(p => p.id);
  const { data: allReplies = [] } = useQuery({
    queryKey: ['community-replies', postIds.join(',')],
    queryFn: async () => {
      if (!postIds.length) return [];
      const { data, error } = await supabase
        .from('community_replies' as any)
        .select('*')
        .in('post_id', postIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as { id: string; post_id: string; author_name: string; content: string; created_at: string }[];
    },
    enabled: postIds.length > 0,
  });
  const repliesByPost = allReplies.reduce<Record<string, typeof allReplies>>((acc, r) => {
    (acc[r.post_id] ||= []).push(r);
    return acc;
  }, {});

  // --- Create post ---
  const createPost = useMutation({
    mutationFn: async () => {
      // Content moderation check
      const modResult = moderateFields(title, content);
      if (!modResult.clean) throw new Error(t('moderation.blocked'));

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user!.id)
        .single();
      const authorName = profile?.full_name || user!.email?.split('@')[0] || 'Scout';
      const { error } = await supabase.from('community_posts' as any).insert({
        user_id: user!.id,
        author_name: authorName,
        category,
        title: title.trim(),
        content: content.trim(),
        likes: 0,
        replies_count: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('community.post_created'));
      setTitle('');
      setContent('');
      setComposing(false);
      setPostCooldown(300); // 5 min cooldown
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-mentionable-users'] });
      // Trigger animation on newest post
      setTimeout(() => {
        const allPosts = queryClient.getQueryData<CommunityPost[]>(['community-posts', filter]);
        if (allPosts?.[0]) setJustPosted(allPosts[0].id);
      }, 300);
      setTimeout(() => setJustPosted(null), 1500);
    },
    onError: (err: any) => toast.error(err.message || t('common.error')),
  });

  // --- Like post ---
  const likePost = useMutation({
    mutationFn: async (postId: string) => {
      // Animate
      setAnimatingLike(postId);
      setTimeout(() => setAnimatingLike(null), 600);

      // Optimistic update
      const wasLiked = likedPosts.has(postId);
      setLikedPosts(prev => {
        const next = new Set(prev);
        if (wasLiked) next.delete(postId); else next.add(postId);
        return next;
      });

      const { error } = await supabase.rpc('like_community_post' as any, { post_id: postId, liker_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['community-posts'] }),
    onError: (err: any) => {
      toast.error(err.message || t('common.error'));
      queryClient.invalidateQueries({ queryKey: ['community-my-likes'] });
    },
  });

  // --- Reply to post ---
  const replyToPost = useMutation({
    mutationFn: async (postId: string) => {
      // Content moderation check
      const modResult = moderateFields(replyContent);
      if (!modResult.clean) throw new Error(t('moderation.blocked'));

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user!.id)
        .single();
      const authorName = profile?.full_name || user!.email?.split('@')[0] || 'Scout';
      const { error } = await supabase.from('community_replies' as any).insert({
        post_id: postId,
        user_id: user!.id,
        author_name: authorName,
        content: replyContent.trim(),
      });
      if (error) throw error;
      await supabase.rpc('increment_reply_count' as any, { post_id: postId });
      return postId;
    },
    onSuccess: (postId) => {
      toast.success(t('community.reply_sent'));
      setReplyContent('');
      setReplyingTo(null);
      setReplyCooldown(60); // 1 min cooldown
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-replies'] });
      queryClient.invalidateQueries({ queryKey: ['community-mentionable-users'] });
      // Trigger animation
      setJustReplied(postId);
      setTimeout(() => setJustReplied(null), 1200);
    },
    onError: (err: any) => toast.error(err.message || t('common.error')),
  });

  // --- Premium gate ---
  if (isPremium === false) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Crown className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">{t('community.premium_title')}</h1>
        <p className="text-muted-foreground max-w-md mx-auto">{t('community.premium_desc')}</p>
        <Link to="/pricing">
          <Button>
            <Sparkles className="w-4 h-4 mr-2" />
            {t('community.see_plans')}
          </Button>
        </Link>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return t('community.just_now');
    if (diffMin < 60) return t('community.minutes_ago', { count: diffMin });
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return t('community.hours_ago', { count: diffH });
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return t('community.days_ago', { count: diffD });
    return d.toLocaleDateString();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-primary" />
            {t('community.title')}
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Crown className="w-3 h-3" />
              PRO
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{t('community.subtitle')}</p>
        </div>
        <Button onClick={() => setComposing(true)} disabled={composing}>
          <Send className="w-4 h-4 mr-2" />
          {t('community.new_post')}
        </Button>
      </div>

      {/* Compose form */}
      {composing && (
        <Card className="animate-in slide-in-from-top-2 fade-in duration-300">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-bold">{t('community.compose_title')}</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={t('community.title_placeholder')}
                  maxLength={120}
                />
              </div>
              <Select value={category} onValueChange={v => setCategory(v as PostCategory)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="question">{t('community.cat_question')}</SelectItem>
                  <SelectItem value="suggestion">{t('community.cat_suggestion')}</SelectItem>
                  <SelectItem value="match">{t('community.cat_match')}</SelectItem>
                  <SelectItem value="player">{t('community.cat_player')}</SelectItem>
                  <SelectItem value="general">{t('community.cat_general')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={t('community.content_placeholder')}
              rows={4}
              maxLength={2000}
            />
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setComposing(false); setTitle(''); setContent(''); }}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={() => createPost.mutate()}
                disabled={!title.trim() || !content.trim() || createPost.isPending || postCooldown > 0}
              >
                {createPost.isPending ? t('common.loading') : postCooldown > 0 ? `${Math.floor(postCooldown / 60)}:${String(postCooldown % 60).padStart(2, '0')}` : t('community.publish')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <button
              key={cat.value}
              onClick={() => setFilter(cat.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filter === cat.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {cat.value === 'all' ? t('community.filter_all') : t(`community.cat_${cat.value}`)}
            </button>
          );
        })}
      </div>

      {/* Posts list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('community.empty')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('community.empty_desc')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post, idx) => {
            const isLiked = likedPosts.has(post.id);
            const isAnimatingLike = animatingLike === post.id;
            const isNew = justPosted === post.id;
            const hasNewReply = justReplied === post.id;

            return (
              <Card
                key={post.id}
                className={cn(
                  'transition-all duration-300 hover:border-primary/20',
                  isNew && 'animate-in slide-in-from-top-3 fade-in duration-500 ring-2 ring-primary/30',
                  hasNewReply && 'ring-2 ring-green-500/30',
                )}
                style={{ animationDelay: isNew ? '0ms' : `${idx * 30}ms` }}
              >
                <CardContent className="p-4">
                  {/* Post header */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{post.author_name}</span>
                        <button
                          onClick={() => { setReplyingTo(post.id); setExpandedPost(post.id); setReplyContent(prev => `@${post.author_name} ${prev}`); }}
                          className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                          title={t('community.mention')}
                        >@</button>
                        <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[post.category]}`}>
                          {t(`community.cat_${post.category}`)}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(post.created_at)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold mt-1">{post.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line leading-relaxed">
                        {renderWithMentions(post.content)}
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-4 mt-3">
                        <button
                          onClick={() => likePost.mutate(post.id)}
                          className={cn(
                            'flex items-center gap-1.5 text-xs transition-all duration-200',
                            isLiked ? 'text-rose-500 font-medium' : 'text-muted-foreground hover:text-rose-500',
                          )}
                        >
                          <Heart
                            className={cn(
                              'w-3.5 h-3.5 transition-all duration-200',
                              isLiked && 'fill-rose-500',
                              isAnimatingLike && 'scale-150',
                            )}
                          />
                          {post.likes > 0 && <span className={cn(isAnimatingLike && 'scale-110 transition-transform')}>{post.likes}</span>}
                        </button>
                        {post.replies_count > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {post.replies_count} {post.replies_count > 1 ? t('community.replies_count_plural') : t('community.replies_count_single')}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setReplyingTo(replyingTo === post.id ? null : post.id);
                            setExpandedPost(post.id);
                          }}
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium ml-auto"
                        >
                          {t('community.reply')}
                        </button>
                      </div>

                      {/* Replies — always visible */}
                      {(repliesByPost[post.id] || []).length > 0 && (
                        <div className="mt-4 space-y-3 pl-4 border-l-2 border-border">
                          {(repliesByPost[post.id] || []).map(reply => (
                            <div key={reply.id} className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold">{reply.author_name}</span>
                                <span className="text-[10px] text-muted-foreground">{formatDate(reply.created_at)}</span>
                                <button
                                  onClick={() => { setReplyingTo(post.id); setReplyContent(prev => `@${reply.author_name} ${prev}`); }}
                                  className="text-[10px] text-primary hover:underline"
                                >
                                  {t('community.mention')}
                                </button>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {renderWithMentions(reply.content)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply input — toggled */}
                      {replyingTo === post.id && (
                        <div className="relative flex gap-2 mt-4 pt-3 border-t border-border animate-in fade-in duration-200">
                          <div className="relative flex-1">
                            <Input
                              ref={replyInputRef}
                              value={replyContent}
                              onChange={e => { handleReplyChange(e.target.value); }}
                              placeholder={t('community.reply_placeholder')}
                              className="text-sm"
                              onKeyDown={e => {
                                if (mentionQuery !== null && mentionSuggestions.length > 0) {
                                  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1)); return; }
                                  if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
                                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex].author_name); return; }
                                  if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
                                }
                                if (e.key === 'Enter' && !e.shiftKey && replyContent.trim()) {
                                  e.preventDefault();
                                  replyToPost.mutate(post.id);
                                }
                              }}
                              onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
                            />
                            {mentionQuery !== null && mentionSuggestions.length > 0 && (
                              <div className="absolute bottom-full left-0 mb-1 w-full max-h-40 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
                                {mentionSuggestions.map((u, i) => (
                                  <button
                                    key={u.author_name}
                                    className={cn(
                                      'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors',
                                      i === mentionIndex && 'bg-accent',
                                    )}
                                    onMouseDown={e => { e.preventDefault(); insertMention(u.author_name); }}
                                  >
                                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                      <User className="w-3 h-3 text-primary" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="font-medium">{u.author_name}</span>
                                      {(u.role || u.club) && (
                                        <span className="text-[10px] text-muted-foreground ml-1.5">
                                          {u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : ''}{u.role && u.club ? ' · ' : ''}{u.club || ''}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => replyToPost.mutate(post.id)}
                            disabled={!replyContent.trim() || replyToPost.isPending || replyCooldown > 0}
                            title={replyCooldown > 0 ? `${replyCooldown}s` : ''}
                          >
                            {replyCooldown > 0 ? <span className="text-[10px] font-mono">{replyCooldown}s</span> : <Send className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
