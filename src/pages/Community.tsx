import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPremium, useIsAdmin } from '@/hooks/use-admin';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  MessageSquare, Crown, Sparkles, Send, User, Calendar, Filter,
  MessageCircle, HelpCircle, Lightbulb, Trophy, Users as UsersIcon, Heart, ExternalLink, Trash2, AlertTriangle,
  Link2, ImageIcon, Archive, ArchiveRestore,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
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
  is_archived?: boolean;
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
// Mention link with tooltip on hover + navigate to profile on click
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function getSessionHeader(): Record<string, string> {
  try {
    const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
    return session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch { return {}; }
}

// Extracts unique mentioned user IDs from rich-format text
function extractMentionedUserIds(text: string): string[] {
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[2] && !ids.includes(m[2])) ids.push(m[2]);
  }
  return ids;
}

async function sendCommunityNotification(targetUserId: string, type: string, title: string, message: string, link = '/community') {
  try {
    await fetch(`${API_BASE}/community/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSessionHeader() },
      body: JSON.stringify({ target_user_id: targetUserId, type, title, message, link }),
    });
  } catch { /* non-blocking */ }
}

async function sendMentionNotifications(mentionedIds: string[], authorName: string, contextType: 'post' | 'reply') {
  if (!mentionedIds.length) return;
  try {
    await fetch(`${API_BASE}/community/notify-mention`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSessionHeader() },
      body: JSON.stringify({ mentioned_user_ids: mentionedIds, author_name: authorName, context_type: contextType }),
    });
  } catch { /* non-blocking */ }
}

// ---------------------------------------------------------------------------
// Author avatar — lazy-loads photo per userId with a shared module-level cache
const _photoCache = new Map<string, string | null>();

function AuthorAvatar({ userId, name }: { userId: string | null; name: string }) {
  const cached = userId ? _photoCache.get(userId) : undefined;
  const [photoUrl, setPhotoUrl] = useState<string | null>(cached ?? null);

  useEffect(() => {
    if (!userId || _photoCache.has(userId)) return;
    fetch(`${API_BASE}/profile/user/${encodeURIComponent(userId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const url = d?.photo_url || null;
        _photoCache.set(userId, url);
        setPhotoUrl(url);
      })
      .catch(() => _photoCache.set(userId, null));
  }, [userId]);

  if (photoUrl) {
    return <img src={photoUrl} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0 mt-0.5" />;
  }
  return (
    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
      <User className="w-4 h-4 text-primary" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content renderer — handles @[Name](userId) mentions, ![alt](url) images, [text](url) links
function renderContent(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  // Order matters: images before links, mentions last (different prefix @)
  const re = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|@\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) result.push(<span key={key++}>{text.slice(last, match.index)}</span>);
    if (match[1] !== undefined) {
      // Image: ![alt](url)
      result.push(
        <img
          key={key++}
          src={match[2]}
          alt={match[1] || 'image'}
          className="max-w-full rounded-lg border border-border my-2 max-h-80 object-contain"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      );
    } else if (match[3] !== undefined) {
      // Link: [text](url)
      result.push(
        <a
          key={key++}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity inline-flex items-center gap-0.5"
        >
          {match[3]}
          <ExternalLink className="w-3 h-3 inline shrink-0" />
        </a>
      );
    } else {
      // Mention: @[Name](userId)
      result.push(<MentionLink key={key++} name={match[5]} userId={match[6]} />);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) result.push(<span key={key++}>{text.slice(last)}</span>);
  return result;
}

// @[Name](userId) — rich format only (plain @Name is rendered as-is)
function MentionLink({ name, userId }: { name: string; userId: string }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const loadingRef = useRef(false);

  const fetchProfile = useCallback(async () => {
    if (profile || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const r = await fetch(`${API_BASE}/profile/user/${encodeURIComponent(userId)}`);
      const d = r.ok ? await r.json() : null;
      setProfile(d);
    } catch { /* silent */ }
  }, [userId, profile]);

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseEnter={fetchProfile}
          onClick={e => { e.preventDefault(); navigate(`/profile/${userId}`); }}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[13px] font-semibold no-underline hover:bg-primary/20 transition-colors cursor-pointer align-baseline"
        >
          <User className="w-3 h-3 shrink-0" />
          {name}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="p-0 overflow-hidden w-64 shadow-lg">
        {!profile ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Chargement…</div>
        ) : (
          <div>
            <div className="flex items-center gap-3 px-3 py-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-base shrink-0">
                {profile.photo_url
                  ? <img src={profile.photo_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  : (profile.full_name?.[0]?.toUpperCase() || '?')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate leading-tight">
                  {[profile.civility, profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.full_name}
                </p>
                {profile.role && (
                  <p className="text-[11px] text-muted-foreground capitalize leading-tight">{profile.role}</p>
                )}
              </div>
            </div>
            {(profile.company || profile.club || profile.reference_club) && (
              <div className="border-t border-border px-3 py-2 space-y-0.5">
                {profile.company && (
                  <p className="text-[11px] text-muted-foreground truncate">🏢 {profile.company}</p>
                )}
                {profile.club && (
                  <p className="text-[11px] text-muted-foreground truncate">⚽ {profile.club}</p>
                )}
                {profile.reference_club && (
                  <p className="text-[11px] text-muted-foreground truncate">🏟️ {profile.reference_club}</p>
                )}
              </div>
            )}
            <div className="border-t border-border px-3 py-2">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ExternalLink className="w-3 h-3" /> Cliquer pour voir le profil complet
              </span>
            </div>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// Component
// ---------------------------------------------------------------------------

export default function Community() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: isPremium } = useIsPremium();
  const { data: isAdmin } = useIsAdmin();
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
  const [deletePostId, setDeletePostId] = useState<string | null>(null);
  const [deleteReplyId, setDeleteReplyId] = useState<string | null>(null);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [linkForm, setLinkForm] = useState({ open: false, text: '', url: '' });
  const [imageForm, setImageForm] = useState({ open: false, url: '' });
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  // Maps mention display-name → userId, populated at insert time, consumed at submit
  const mentionMapRef = useRef<Map<string, string>>(new Map());

  // Serialize display content (@Name) → rich format (@[Name](userId)) before saving
  const serializeContent = useCallback((text: string) => {
    let result = text;
    for (const [name, uid] of mentionMapRef.current.entries()) {
      result = result.split(`@${name}`).join(`@[${name}](${uid})`);
    }
    return result;
  }, []);

  const insertAtCursor = useCallback((insertText: string) => {
    const el = contentRef.current;
    setContent(prev => {
      const start = el?.selectionStart ?? prev.length;
      const end = el?.selectionEnd ?? prev.length;
      return prev.slice(0, start) + insertText + prev.slice(end);
    });
    setTimeout(() => {
      if (!el) return;
      const pos = (el.selectionStart ?? 0) + insertText.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, 0);
  }, []);

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
    ? mentionableUsers
        .filter(u => u.user_id !== user?.id)
        .filter(u => u.author_name.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 5)
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

  const insertMention = useCallback((name: string, userId?: string | null) => {
    // Always display @Name (no id visible), store id in map for serialization at submit
    if (userId) mentionMapRef.current.set(name, userId);
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
      return ((data || []) as unknown as CommunityPost[]).map(p => ({
        ...p,
        is_archived: !!(p as any).is_archived,
      }));
    },
    enabled: !!isPremium,
  });

  // Non-admins never see archived posts; admins see everything
  const visiblePosts = isAdmin ? posts : posts.filter(p => !p.is_archived);

  // --- Fetch user's likes ---
  const { data: likedPostIds = [] } = useQuery({
    queryKey: ['community-my-likes', user?.id],
    queryFn: async () => {
      if (!user) return [] as string[];
      const { data, error } = await supabase
        .from('community_likes' as any)
        .select('post_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []).map((r: any) => r.post_id as string);
    },
    enabled: !!user && !!isPremium,
    staleTime: 30 * 1000,
  });

  // Sync liked posts state from server data (without side effects inside queryFn)
  useEffect(() => {
    setLikedPosts(new Set(likedPostIds));
  }, [likedPostIds]);

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
      return (data || []) as unknown as { id: string; post_id: string; user_id: string | null; author_name: string; content: string; created_at: string }[];
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
      const modResult = moderateFields(title, content);
      if (!modResult.clean) throw new Error(t('moderation.blocked'));

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user!.id)
        .single();
      const authorName = profile?.full_name || user!.email?.split('@')[0] || 'Scout';
      const serialized = serializeContent(content.trim());
      const { error } = await supabase.from('community_posts' as any).insert({
        user_id: user!.id,
        author_name: authorName,
        category,
        title: title.trim(),
        content: serialized,
        likes: 0,
        replies_count: 0,
      });
      if (error) throw error;
      return { authorName, mentionedIds: extractMentionedUserIds(serialized) };
    },
    onSuccess: ({ authorName, mentionedIds }) => {
      toast.success(t('community.post_created'));
      sendMentionNotifications(mentionedIds, authorName, 'post');
      mentionMapRef.current.clear();
      setTitle('');
      setContent('');
      setComposing(false);
      setPostCooldown(300);
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-mentionable-users'] });
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
    mutationFn: async (post: CommunityPost) => {
      setAnimatingLike(post.id);
      setTimeout(() => setAnimatingLike(null), 600);

      const wasLiked = likedPosts.has(post.id);
      setLikedPosts(prev => {
        const next = new Set(prev);
        if (wasLiked) next.delete(post.id); else next.add(post.id);
        return next;
      });

      const { error } = await supabase.rpc('like_community_post' as any, { post_id: post.id, liker_id: user!.id });
      if (error) throw error;
      return { wasLiked, post };
    },
    onSuccess: ({ wasLiked, post }) => {
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      if (!wasLiked && post.user_id && post.user_id !== user!.id) {
        sendCommunityNotification(
          post.user_id, 'like',
          'Votre post a été aimé',
          `Quelqu'un a aimé votre post "${post.title}"`,
        );
      }
    },
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
      const serialized = serializeContent(replyContent.trim());
      const { error } = await supabase.from('community_replies' as any).insert({
        post_id: postId,
        user_id: user!.id,
        author_name: authorName,
        content: serialized,
      });
      if (error) throw error;
      await supabase.rpc('increment_reply_count' as any, { post_id: postId });
      return { postId, authorName, mentionedIds: extractMentionedUserIds(serialized) };
    },
    onSuccess: ({ postId, authorName, mentionedIds }) => {
      toast.success(t('community.reply_sent'));
      sendMentionNotifications(mentionedIds, authorName, 'reply');
      // Notify post author of the new reply
      const parentPost = queryClient.getQueryData<CommunityPost[]>(['community-posts', filter])?.find(p => p.id === postId);
      if (parentPost?.user_id && parentPost.user_id !== user!.id) {
        sendCommunityNotification(
          parentPost.user_id, 'comment',
          'Nouvelle réponse sur votre post',
          `${authorName} a répondu à votre post "${parentPost.title}"`,
        );
      }
      setReplyContent('');
      setReplyingTo(null);
      mentionMapRef.current.clear();
      setReplyCooldown(60);
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-replies'] });
      queryClient.invalidateQueries({ queryKey: ['community-mentionable-users'] });
      setJustReplied(postId);
      setTimeout(() => setJustReplied(null), 1200);
    },
    onError: (err: any) => toast.error(err.message || t('common.error')),
  });

  // --- Archive/unarchive post (admin only) ---
  const toggleArchivePost = useMutation({
    mutationFn: async ({ postId, archived }: { postId: string; archived: boolean }) => {
      const { error } = await supabase
        .from('community_posts' as any)
        .update({ is_archived: archived ? 1 : 0 } as any)
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: (_, { archived }) => {
      toast.success(archived ? t('community.post_archived') : t('community.post_unarchived'));
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
    onError: (err: any) => toast.error(err.message || t('common.error')),
  });

  // --- Delete post (admin or own post) ---
  const deletePost = useMutation({
    mutationFn: async (postId: string) => {
      const { error: repliesError } = await supabase
        .from('community_replies' as any)
        .delete()
        .eq('post_id', postId);
      if (repliesError) throw repliesError;
      const { error } = await supabase
        .from('community_posts' as any)
        .delete()
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('community.delete_post_success'));
      setDeletePostId(null);
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-replies'] });
    },
    onError: (err: any) => toast.error(err.message || t('common.error')),
  });

  // --- Delete reply (admin only) ---
  const deleteReply = useMutation({
    mutationFn: async ({ replyId, postId }: { replyId: string; postId: string }) => {
      const { error } = await supabase
        .from('community_replies' as any)
        .delete()
        .eq('id', replyId);
      if (error) throw error;
      await supabase.rpc('decrement_reply_count' as any, { post_id: postId });
    },
    onSuccess: () => {
      toast.success(t('community.delete_reply_success'));
      setDeleteReplyId(null);
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-replies'] });
    },
    onError: (err: any) => toast.error(err.message || t('common.error')),
  });

  // --- Delete all content (admin only) ---
  const deleteAllContent = useMutation({
    mutationFn: async () => {
      const { data: replyRows } = await supabase
        .from('community_replies' as any)
        .select('id');
      const replyIds = (replyRows || []).map((r: any) => r.id);
      if (replyIds.length) {
        const { error: repliesError } = await supabase
          .from('community_replies' as any)
          .delete()
          .in('id', replyIds);
        if (repliesError) throw repliesError;
      }

      const { data: postRows } = await supabase
        .from('community_posts' as any)
        .select('id');
      const postIds = (postRows || []).map((p: any) => p.id);
      if (postIds.length) {
        const { error } = await supabase
          .from('community_posts' as any)
          .delete()
          .in('id', postIds);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t('community.delete_all_success'));
      setShowDeleteAllDialog(false);
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-replies'] });
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
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="destructive" size="sm" onClick={() => setShowDeleteAllDialog(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('community.delete_all')}
            </Button>
          )}
          <Button onClick={() => setComposing(true)} disabled={composing}>
            <Send className="w-4 h-4 mr-2" />
            {t('community.new_post')}
          </Button>
        </div>
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
            <div className="space-y-2">
              <Textarea
                ref={contentRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder={t('community.content_placeholder')}
                rows={4}
                maxLength={2000}
              />
              {/* Toolbar */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { setImageForm({ open: false, url: '' }); setLinkForm(f => ({ ...f, open: !f.open })); }}
                  className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors', linkForm.open ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30')}
                  title={t('community.insert_link')}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  {t('community.insert_link')}
                </button>
                <button
                  type="button"
                  onClick={() => { setLinkForm({ open: false, text: '', url: '' }); setImageForm(f => ({ ...f, open: !f.open })); }}
                  className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors', imageForm.open ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30')}
                  title={t('community.insert_image')}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {t('community.insert_image')}
                </button>
              </div>
              {/* Link insert panel */}
              {linkForm.open && (
                <div className="flex gap-2 p-3 rounded-lg border border-border bg-muted/40 animate-in fade-in duration-150">
                  <Input
                    placeholder={t('community.link_text_placeholder')}
                    value={linkForm.text}
                    onChange={e => setLinkForm(f => ({ ...f, text: e.target.value }))}
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    placeholder="https://..."
                    value={linkForm.url}
                    onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!linkForm.url.trim()}
                    onClick={() => {
                      const label = linkForm.text.trim() || linkForm.url.trim();
                      insertAtCursor(`[${label}](${linkForm.url.trim()})`);
                      setLinkForm({ open: false, text: '', url: '' });
                    }}
                  >
                    {t('common.add')}
                  </Button>
                </div>
              )}
              {/* Image insert panel */}
              {imageForm.open && (
                <div className="flex gap-2 p-3 rounded-lg border border-border bg-muted/40 animate-in fade-in duration-150">
                  <Input
                    placeholder="https://... (.jpg, .png, .gif…)"
                    value={imageForm.url}
                    onChange={e => setImageForm(f => ({ ...f, url: e.target.value }))}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!imageForm.url.trim()}
                    onClick={() => {
                      insertAtCursor(`![image](${imageForm.url.trim()})`);
                      setImageForm({ open: false, url: '' });
                    }}
                  >
                    {t('common.add')}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setComposing(false); setTitle(''); setContent(''); setLinkForm({ open: false, text: '', url: '' }); setImageForm({ open: false, url: '' }); }}>
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
      ) : visiblePosts.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('community.empty')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('community.empty_desc')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map((post, idx) => {
            const isLiked = likedPosts.has(post.id);
            const isAnimatingLike = animatingLike === post.id;
            const isNew = justPosted === post.id;
            const hasNewReply = justReplied === post.id;
            const isArchived = !!post.is_archived;

            return (
              <Card
                key={post.id}
                className={cn(
                  'transition-all duration-300 hover:border-primary/20',
                  isNew && 'animate-in slide-in-from-top-3 fade-in duration-500 ring-2 ring-primary/30',
                  hasNewReply && 'ring-2 ring-green-500/30',
                  isArchived && 'opacity-50 border-dashed',
                )}
                style={{ animationDelay: isNew ? '0ms' : `${idx * 30}ms` }}
              >
                <CardContent className="p-4">
                  {/* Archived badge */}
                  {isArchived && (
                    <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <Archive className="w-3 h-3" />
                      {t('community.archived')}
                    </div>
                  )}
                  {/* Post header */}
                  <div className="flex items-start gap-3">
                    <AuthorAvatar userId={post.user_id} name={post.author_name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{post.author_name}</span>
                        <button
                          onClick={() => { setReplyingTo(post.id); setExpandedPost(post.id); if (post.user_id) mentionMapRef.current.set(post.author_name, post.user_id); setReplyContent(prev => `@${post.author_name} ${prev}`); }}
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
                        <div className="ml-auto flex items-center gap-1.5">
                          {isAdmin && (
                            <button
                              onClick={() => toggleArchivePost.mutate({ postId: post.id, archived: !isArchived })}
                              className="text-muted-foreground hover:text-amber-500 transition-colors"
                              title={isArchived ? t('community.unarchive_post') : t('community.archive_post')}
                            >
                              {isArchived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {(isAdmin || post.user_id === user?.id) && (
                            <button
                              onClick={() => setDeletePostId(post.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title={t('community.delete_post')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <h3 className="text-sm font-bold mt-1">{post.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line leading-relaxed">
                        {renderContent(post.content)}
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-4 mt-3">
                        <button
                          onClick={() => likePost.mutate(post)}
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
                                {reply.user_id !== user?.id && (
                                  <button
                                    onClick={() => { setReplyingTo(post.id); if (reply.user_id) mentionMapRef.current.set(reply.author_name, reply.user_id); setReplyContent(prev => `@${reply.author_name} ${prev}`); }}
                                    className="text-[10px] text-primary hover:underline"
                                  >
                                    {t('community.mention')}
                                  </button>
                                )}
                                {(isAdmin || reply.user_id === user?.id) && (
                                  <button
                                    onClick={() => setDeleteReplyId(`${reply.id}::${post.id}`)}
                                    className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                                    title={t('community.delete_reply')}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {renderContent(reply.content)}
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
                                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex].author_name, mentionSuggestions[mentionIndex].user_id); return; }
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
                                    onMouseDown={e => { e.preventDefault(); insertMention(u.author_name, u.user_id); }}
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

      {/* Confirm delete post */}
      <Dialog open={!!deletePostId} onOpenChange={open => !open && setDeletePostId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              {t('community.delete_post')}
            </DialogTitle>
            <DialogDescription>{t('community.delete_post_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletePostId(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => deletePostId && deletePost.mutate(deletePostId)}
              disabled={deletePost.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete reply */}
      <Dialog open={!!deleteReplyId} onOpenChange={open => !open && setDeleteReplyId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              {t('community.delete_reply')}
            </DialogTitle>
            <DialogDescription>{t('community.delete_reply_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteReplyId(null)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!deleteReplyId) return;
                const [replyId, postId] = deleteReplyId.split('::');
                deleteReply.mutate({ replyId, postId });
              }}
              disabled={deleteReply.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete all */}
      <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              {t('community.delete_all')}
            </DialogTitle>
            <DialogDescription>{t('community.delete_all_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDeleteAllDialog(false)}>{t('common.cancel')}</Button>
            <Button
              variant="destructive"
              onClick={() => deleteAllContent.mutate()}
              disabled={deleteAllContent.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('community.delete_all')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
