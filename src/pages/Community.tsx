import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPremium, useIsAdmin } from '@/hooks/use-admin';
import { usePlayers } from '@/hooks/use-players';
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
  Link2, ImageIcon, Archive, ArchiveRestore, Building2, Search, Pin, PinOff, Eye, ChevronDown, ChevronUp,
  ShieldCheck, MoreVertical, ArrowUp, ArrowDown, X as XClose, CheckSquare, Square,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { moderateFields } from '@/lib/content-moderation';
import { LeagueLogo } from '@/components/ui/league-logo';

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
  views: number;
  is_pinned: boolean;
  display_order: number;
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

const CATEGORY_BORDER: Record<PostCategory, string> = {
  question: 'border-l-blue-500',
  suggestion: 'border-l-amber-500',
  match: 'border-l-green-500',
  player: 'border-l-purple-500',
  general: 'border-l-primary/40',
};

// Popular leagues for the championship picker
const POPULAR_LEAGUES = [
  'Ligue 1', 'Ligue 2', 'Premier League', 'EFL Championship',
  'La Liga', 'La Liga 2', 'Serie A', 'Serie B', 'Bundesliga', '2. Bundesliga',
  'Liga Portugal', 'Eredivisie', 'Jupiler Pro League', 'Super Lig',
  'Champions League', 'Europa League', 'Conference League',
  'MLS', 'Liga MX', 'Brasileirão Série A', 'Liga Profesional Argentina',
  'Saudi Pro League', 'J-League', 'Copa Libertadores',
];

// ── Attachment chips rendered inline in post content ──────────────────────

function PlayerTag({ name, playerId }: { name: string; playerId: string }) {
  return (
    <Link
      to={`/player/${playerId}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 text-[12px] font-semibold hover:bg-purple-500/20 transition-colors no-underline align-baseline"
    >
      <UsersIcon className="w-3 h-3 shrink-0" />
      {name}
    </Link>
  );
}

function ClubTag({ name }: { name: string }) {
  return (
    <Link
      to={`/club?club=${encodeURIComponent(name)}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[12px] font-semibold hover:bg-blue-500/20 transition-colors no-underline align-baseline"
    >
      <Building2 className="w-3 h-3 shrink-0" />
      {name}
    </Link>
  );
}

function ChampTag({ name }: { name: string }) {
  return (
    <Link
      to={`/championships`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[12px] font-semibold hover:bg-amber-500/20 transition-colors no-underline align-baseline"
    >
      <LeagueLogo league={name} size="xs" />
      {name}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Mention link with tooltip on hover + navigate to profile on click
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');


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
      headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const,
      body: JSON.stringify({ target_user_id: targetUserId, type, title, message, link }),
    });
  } catch { /* non-blocking */ }
}

async function sendMentionNotifications(mentionedIds: string[], authorName: string, contextType: 'post' | 'reply') {
  if (!mentionedIds.length) return;
  try {
    await fetch(`${API_BASE}/community/notify-mention`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const,
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
      const text = match[3];
      const url = match[4];
      // Internal chips: player, club, champ
      if (text.startsWith('player:')) {
        result.push(<PlayerTag key={key++} name={text.slice(7)} playerId={url} />);
      } else if (text.startsWith('club:')) {
        result.push(<ClubTag key={key++} name={text.slice(5)} />);
      } else if (text.startsWith('champ:')) {
        result.push(<ChampTag key={key++} name={text.slice(6)} />);
      } else {
        // Regular external link
        result.push(
          <a
            key={key++}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity inline-flex items-center gap-0.5"
          >
            {text}
            <ExternalLink className="w-3 h-3 inline shrink-0" />
          </a>
        );
      }
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
  const [profile, setProfile] = useState<{ photo_url?: string | null; full_name?: string | null; first_name?: string | null; last_name?: string | null; civility?: string | null; role?: string | null; company?: string | null; club?: string | null; reference_club?: string | null } | null>(null);
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
  const [playerForm, setPlayerForm] = useState({ open: false, search: '' });
  const [clubForm, setClubForm] = useState({ open: false, search: '' });
  const [champForm, setChampForm] = useState({ open: false });
  const [heartParticles, setHeartParticles] = useState<Record<string, number[]>>({});
  const heartIdRef = useRef(0);
  const [moderationMode, setModerationMode] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const viewedPostsRef = useRef<Set<string>>(new Set());
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const replyInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
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

  // --- Own players (for player attachment picker) ---
  const { data: allPlayers = [] } = usePlayers();
  const filteredPlayers = playerForm.open && playerForm.search.trim().length >= 1
    ? allPlayers.filter(p =>
        p.name.toLowerCase().includes(playerForm.search.toLowerCase()) ||
        (p.club && p.club.toLowerCase().includes(playerForm.search.toLowerCase()))
      ).slice(0, 8)
    : playerForm.open ? allPlayers.slice(0, 8) : [];

  // --- Club search (for club attachment picker) ---
  const { data: clubSuggestions = [] } = useQuery<Array<{ club_name: string; logo_url: string | null; competition: string | null }>>({
    queryKey: ['community-club-search', clubForm.search],
    queryFn: async () => {
      if (!clubForm.search.trim() || clubForm.search.length < 2) return [];
      const r = await fetch(`${API_BASE}/club-search?q=${encodeURIComponent(clubForm.search)}`);
      return r.ok ? r.json() : [];
    },
    enabled: clubForm.open && clubForm.search.trim().length >= 2,
    staleTime: 30_000,
  });

  // --- Helpers to close all toolbars ---
  const closeAllToolbars = () => {
    setLinkForm({ open: false, text: '', url: '' });
    setImageForm({ open: false, url: '' });
    setPlayerForm({ open: false, search: '' });
    setClubForm({ open: false, search: '' });
    setChampForm({ open: false });
  };

  // --- Like with floating hearts ---
  const spawnHearts = (postId: string) => {
    const ids = Array.from({ length: 6 }, () => ++heartIdRef.current);
    setHeartParticles(prev => ({ ...prev, [postId]: [...(prev[postId] || []), ...ids] }));
    setTimeout(() => {
      setHeartParticles(prev => {
        const next = { ...prev };
        next[postId] = (next[postId] || []).filter(id => !ids.includes(id));
        return next;
      });
    }, 850);
  };

  // --- Bulk moderation ---
  const bulkAction = useMutation({
    mutationFn: async ({ action, value }: { action: string; value?: boolean }) => {
      const ids = [...selectedPosts];
      const res = await fetch(`${API_BASE}/community/bulk`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (_, { action }) => {
      const labels: Record<string, string> = { archive: 'Postes clôturés', pin: 'Postes épinglés', priority_up: 'Priorité augmentée', priority_down: 'Priorité baissée', delete: 'Postes supprimés' };
      toast.success(labels[action] || 'Action effectuée');
      setSelectedPosts(new Set());
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  // --- Auto-scroll to reply section when post is expanded ---
  useEffect(() => {
    if (!expandedPost) return;
    requestAnimationFrame(() => {
      const el = postRefs.current[expandedPost];
      if (el) {
        const replySection = el.querySelector('[data-reply-anchor]') as HTMLElement | null;
        const target = replySection || el;
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }, [expandedPost]);

  // --- Increment view count (once per session per post) ---
  const trackView = (postId: string) => {
    if (viewedPostsRef.current.has(postId)) return;
    viewedPostsRef.current.add(postId);
    fetch(`${API_BASE}/community/posts/${postId}/view`, { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  // --- Fetch mentionable users (with profile info for suggestions) ---
  const { data: mentionableUsers = [] } = useQuery({
    queryKey: ['community-mentionable-users'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_mentionable_users', {} as Record<string, never>);
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
        .from('community_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (filter !== 'all') {
        query = query.eq('category', filter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return ((data || []) as unknown as CommunityPost[])
        .map(p => ({
          ...p,
          is_archived: !!p.is_archived,
          is_pinned: !!p.is_pinned,
          views: p.views || 0,
          display_order: p.display_order || 0,
        }))
        .sort((a, b) => {
          if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
          if (a.display_order !== b.display_order) return b.display_order - a.display_order;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
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
        .from('community_likes')
        .select('post_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []).map((r) => r.post_id);
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
        .from('community_replies')
        .select('*')
        .in('post_id', postIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as { id: string; post_id: string; user_id: string | null; author_name: string; content: string; created_at: string }[];
    },
    enabled: postIds.length > 0,
    staleTime: 5 * 60 * 1000,
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
      const { error } = await supabase.from('community_posts').insert({
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
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  // --- Like post ---
  const likePost = useMutation({
    mutationFn: async (post: CommunityPost) => {
      setAnimatingLike(post.id);
      setTimeout(() => setAnimatingLike(null), 500);
      spawnHearts(post.id);

      const wasLiked = likedPosts.has(post.id);
      setLikedPosts(prev => {
        const next = new Set(prev);
        if (wasLiked) next.delete(post.id); else next.add(post.id);
        return next;
      });

      const { error } = await supabase.rpc('like_community_post', { post_id: post.id, liker_id: user!.id });
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
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : String(err));
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
      const { error } = await supabase.from('community_replies').insert({
        post_id: postId,
        user_id: user!.id,
        author_name: authorName,
        content: serialized,
      });
      if (error) throw error;
      await supabase.rpc('increment_reply_count', { post_id: postId });
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
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  // --- Archive/unarchive post (admin only) ---
  const toggleArchivePost = useMutation({
    mutationFn: async ({ postId, archived }: { postId: string; archived: boolean }) => {
      const { error } = await supabase
        .from('community_posts')
        .update({ is_archived: !!archived })
        .eq('id', postId);
      if (error) throw error;
    },
    onSuccess: (_, { archived }) => {
      toast.success(archived ? t('community.post_archived') : t('community.post_unarchived'));
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  // --- Delete post (admin or own post) ---
  const deletePost = useMutation({
    mutationFn: async (postId: string) => {
      const { error: repliesError } = await supabase
        .from('community_replies')
        .delete()
        .eq('post_id', postId);
      if (repliesError) throw repliesError;
      const { error } = await supabase
        .from('community_posts')
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
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  // --- Delete reply (admin only) ---
  const deleteReply = useMutation({
    mutationFn: async ({ replyId, postId }: { replyId: string; postId: string }) => {
      const { error } = await supabase
        .from('community_replies')
        .delete()
        .eq('id', replyId);
      if (error) throw error;
      await supabase.rpc('decrement_reply_count', { post_id: postId });
    },
    onSuccess: () => {
      toast.success(t('community.delete_reply_success'));
      setDeleteReplyId(null);
      queryClient.invalidateQueries({ queryKey: ['community-posts'] });
      queryClient.invalidateQueries({ queryKey: ['community-replies'] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
  });

  // --- Delete all content (admin only) ---
  const deleteAllContent = useMutation({
    mutationFn: async () => {
      const { data: replyRows } = await supabase
        .from('community_replies')
        .select('id');
      const replyIds = (replyRows || []).map((r) => r.id);
      if (replyIds.length) {
        const { error: repliesError } = await supabase
          .from('community_replies')
          .delete()
          .in('id', replyIds);
        if (repliesError) throw repliesError;
      }

      const { data: postRows } = await supabase
        .from('community_posts')
        .select('id');
      const postIds = (postRows || []).map((p) => p.id);
      if (postIds.length) {
        const { error } = await supabase
          .from('community_posts')
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
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
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
          {/* Mode modération — admin/mod only */}
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setModerationMode(v => !v); setSelectedPosts(new Set()); }}
                  className={cn(
                    'p-2 rounded-lg border text-xs transition-all',
                    moderationMode
                      ? 'bg-amber-500/10 border-amber-400 text-amber-600'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Mode modération</TooltipContent>
            </Tooltip>
          )}
          {/* Delete all — discret icon button */}
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowDeleteAllDialog(true)}
                  className="p-2 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-destructive">{t('community.delete_all')}</TooltipContent>
            </Tooltip>
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
              <div className="flex items-center gap-1 flex-wrap">
                {/* Lien externe */}
                <button type="button" onClick={() => { closeAllToolbars(); setLinkForm({ open: true, text: '', url: '' }); }}
                  className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors', linkForm.open ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30')}>
                  <Link2 className="w-3.5 h-3.5" />{t('community.insert_link')}
                </button>
                {/* Image */}
                <button type="button" onClick={() => { closeAllToolbars(); setImageForm({ open: true, url: '' }); }}
                  className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors', imageForm.open ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/30')}>
                  <ImageIcon className="w-3.5 h-3.5" />{t('community.insert_image')}
                </button>
                {/* Joueur */}
                <button type="button" onClick={() => { closeAllToolbars(); setPlayerForm({ open: true, search: '' }); }}
                  className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors', playerForm.open ? 'bg-purple-500/10 border-purple-400 text-purple-600' : 'border-border text-muted-foreground hover:text-purple-600 hover:border-purple-400')}>
                  <UsersIcon className="w-3.5 h-3.5" />Joueur
                </button>
                {/* Club */}
                <button type="button" onClick={() => { closeAllToolbars(); setClubForm({ open: true, search: '' }); }}
                  className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors', clubForm.open ? 'bg-blue-500/10 border-blue-400 text-blue-600' : 'border-border text-muted-foreground hover:text-blue-600 hover:border-blue-400')}>
                  <Building2 className="w-3.5 h-3.5" />Club
                </button>
                {/* Championnat */}
                <button type="button" onClick={() => { closeAllToolbars(); setChampForm({ open: true }); }}
                  className={cn('flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium border transition-colors', champForm.open ? 'bg-amber-500/10 border-amber-400 text-amber-600' : 'border-border text-muted-foreground hover:text-amber-600 hover:border-amber-400')}>
                  <Trophy className="w-3.5 h-3.5" />Championnat
                </button>
              </div>

              {/* Panel : lien externe */}
              {linkForm.open && (
                <div className="flex gap-2 p-3 rounded-lg border border-border bg-muted/40 animate-in fade-in duration-150">
                  <Input placeholder={t('community.link_text_placeholder')} value={linkForm.text} onChange={e => setLinkForm(f => ({ ...f, text: e.target.value }))} className="h-8 text-xs flex-1" />
                  <Input placeholder="https://..." value={linkForm.url} onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))} className="h-8 text-xs flex-1" />
                  <Button size="sm" className="h-8 text-xs" disabled={!linkForm.url.trim()} onClick={() => { insertAtCursor(`[${linkForm.text.trim() || linkForm.url.trim()}](${linkForm.url.trim()})`); setLinkForm({ open: false, text: '', url: '' }); }}>{t('common.add')}</Button>
                </div>
              )}

              {/* Panel : image */}
              {imageForm.open && (
                <div className="flex gap-2 p-3 rounded-lg border border-border bg-muted/40 animate-in fade-in duration-150">
                  <Input placeholder="https://... (.jpg, .png, .gif…)" value={imageForm.url} onChange={e => setImageForm(f => ({ ...f, url: e.target.value }))} className="h-8 text-xs flex-1" />
                  <Button size="sm" className="h-8 text-xs" disabled={!imageForm.url.trim()} onClick={() => { insertAtCursor(`![image](${imageForm.url.trim()})`); setImageForm({ open: false, url: '' }); }}>{t('common.add')}</Button>
                </div>
              )}

              {/* Panel : joueur */}
              {playerForm.open && (
                <div className="p-3 rounded-lg border border-purple-300/50 bg-purple-50/40 dark:bg-purple-950/20 dark:border-purple-800/30 animate-in fade-in duration-150 space-y-2">
                  <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                    <UsersIcon className="w-3.5 h-3.5" />Lier un joueur de votre liste
                  </p>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input autoFocus placeholder="Rechercher…" value={playerForm.search} onChange={e => setPlayerForm(f => ({ ...f, search: e.target.value }))} className="h-8 text-xs pl-8" />
                  </div>
                  {filteredPlayers.length > 0 && (
                    <div className="space-y-0.5 max-h-44 overflow-y-auto">
                      {filteredPlayers.map(p => (
                        <button key={p.id} type="button" onClick={() => { insertAtCursor(`[player:${p.name}](${p.id})`); setPlayerForm({ open: false, search: '' }); }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-purple-100/70 dark:hover:bg-purple-900/30 flex items-center gap-2 transition-colors group">
                          <div className="w-6 h-6 rounded-full bg-purple-500/15 flex items-center justify-center text-[10px] font-bold text-purple-600 shrink-0">{p.name[0]}</div>
                          <span className="font-medium flex-1 truncate">{p.name}</span>
                          <span className="text-muted-foreground text-[10px] shrink-0">{p.position}{p.club ? ` · ${p.club}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredPlayers.length === 0 && playerForm.search.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">Aucun joueur trouvé</p>
                  )}
                </div>
              )}

              {/* Panel : club */}
              {clubForm.open && (
                <div className="p-3 rounded-lg border border-blue-300/50 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800/30 animate-in fade-in duration-150 space-y-2">
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />Lier un club
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input autoFocus placeholder="Nom du club…" value={clubForm.search} onChange={e => setClubForm(f => ({ ...f, search: e.target.value }))}
                        className="h-8 text-xs pl-8"
                        onKeyDown={e => { if (e.key === 'Enter' && clubForm.search.trim()) { insertAtCursor(`[club:${clubForm.search.trim()}](${clubForm.search.trim()})`); setClubForm({ open: false, search: '' }); } }} />
                    </div>
                    <Button size="sm" className="h-8 text-xs" disabled={!clubForm.search.trim()} onClick={() => { insertAtCursor(`[club:${clubForm.search.trim()}](${clubForm.search.trim()})`); setClubForm({ open: false, search: '' }); }}>Lier</Button>
                  </div>
                  {clubSuggestions.length > 0 && (
                    <div className="space-y-0.5 max-h-36 overflow-y-auto">
                      {clubSuggestions.map(c => (
                        <button key={c.club_name} type="button" onClick={() => { insertAtCursor(`[club:${c.club_name}](${c.club_name})`); setClubForm({ open: false, search: '' }); }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-blue-100/70 dark:hover:bg-blue-900/30 flex items-center gap-2 transition-colors">
                          {c.logo_url && <img src={c.logo_url} alt={c.club_name} className="w-5 h-5 object-contain shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
                          <span className="font-medium flex-1 truncate">{c.club_name}</span>
                          {c.competition && <span className="text-muted-foreground text-[10px] shrink-0 truncate max-w-[100px]">{c.competition}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Panel : championnat */}
              {champForm.open && (
                <div className="p-3 rounded-lg border border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800/30 animate-in fade-in duration-150 space-y-2">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5" />Lier un championnat
                  </p>
                  <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                    {POPULAR_LEAGUES.map(league => (
                      <button key={league} type="button" onClick={() => { insertAtCursor(`[champ:${league}](${league})`); setChampForm({ open: false }); }}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border border-border hover:bg-amber-100/60 dark:hover:bg-amber-900/20 hover:border-amber-400/50 transition-colors text-left">
                        <LeagueLogo league={league} size="xs" className="shrink-0" />
                        <span className="truncate font-medium">{league}</span>
                      </button>
                    ))}
                  </div>
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

      {/* Bulk moderation bar */}
      {moderationMode && (
        <div className={cn(
          'flex items-center gap-2 flex-wrap px-4 py-2.5 rounded-xl border transition-all',
          selectedPosts.size > 0
            ? 'bg-amber-500/8 border-amber-400/40'
            : 'bg-muted/40 border-border'
        )}>
          {/* Select all */}
          <button
            onClick={() => {
              if (selectedPosts.size === visiblePosts.length) setSelectedPosts(new Set());
              else setSelectedPosts(new Set(visiblePosts.map(p => p.id)));
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {selectedPosts.size === visiblePosts.length
              ? <CheckSquare className="w-3.5 h-3.5 text-amber-500" />
              : <Square className="w-3.5 h-3.5" />}
            {selectedPosts.size === visiblePosts.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
          {selectedPosts.size > 0 && (
            <>
              <span className="text-xs font-semibold text-amber-600 px-2 py-0.5 bg-amber-500/10 rounded-full">
                {selectedPosts.size} sélectionné{selectedPosts.size > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                <button onClick={() => bulkAction.mutate({ action: 'pin', value: true })} disabled={bulkAction.isPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-primary/5 hover:border-primary/30 transition-all">
                  <Pin className="w-3.5 h-3.5 text-primary" />Épingler
                </button>
                <button onClick={() => bulkAction.mutate({ action: 'pin', value: false })} disabled={bulkAction.isPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted transition-all">
                  <PinOff className="w-3.5 h-3.5" />Désépingler
                </button>
                <button onClick={() => bulkAction.mutate({ action: 'archive', value: true })} disabled={bulkAction.isPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-amber-500/5 hover:border-amber-400/40 transition-all">
                  <Archive className="w-3.5 h-3.5 text-amber-500" />Clôturer
                </button>
                <button onClick={() => bulkAction.mutate({ action: 'priority_up' })} disabled={bulkAction.isPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted transition-all">
                  <ArrowUp className="w-3.5 h-3.5" />Priorité +
                </button>
                <button onClick={() => bulkAction.mutate({ action: 'priority_down' })} disabled={bulkAction.isPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border bg-background hover:bg-muted transition-all">
                  <ArrowDown className="w-3.5 h-3.5" />Priorité -
                </button>
                <button onClick={() => setDeletePostId('__bulk__')} disabled={bulkAction.isPending}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />Supprimer
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
            const isPinned = !!post.is_pinned;
            const isExpanded = expandedPost === post.id;
            const isSelected = selectedPosts.has(post.id);

            const toggleExpand = () => {
              if (isExpanded) {
                setExpandedPost(null);
              } else {
                setExpandedPost(post.id);
                trackView(post.id);
              }
            };

            return (
              <div
                key={post.id}
                ref={el => { postRefs.current[post.id] = el; }}
                style={{ animationDelay: isNew ? '0ms' : `${idx * 30}ms` }}
              >
                <Card
                  className={cn(
                    'transition-all duration-300 border-l-4 overflow-hidden',
                    CATEGORY_BORDER[post.category],
                    isExpanded ? 'shadow-md' : 'hover:shadow-sm hover:border-primary/20',
                    isNew && 'animate-in slide-in-from-top-3 fade-in duration-500 ring-2 ring-primary/30',
                    hasNewReply && 'ring-2 ring-green-500/30',
                    isArchived && 'opacity-60',
                    isSelected && 'ring-2 ring-amber-400',
                    isPinned && !isExpanded && 'bg-primary/3',
                  )}
                >
                  <CardContent className="p-4 pt-3">
                    {/* Status badges row */}
                    {(isArchived || isPinned) && (
                      <div className="flex items-center gap-2 mb-2">
                        {isPinned && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-primary uppercase tracking-wider">
                            <Pin className="w-3 h-3" />Épinglé
                          </span>
                        )}
                        {isArchived && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <Archive className="w-3 h-3" />{t('community.archived')}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Header row */}
                    <div className="flex items-start gap-2.5">
                      {/* Moderation checkbox */}
                      {moderationMode && (
                        <button
                          onClick={() => setSelectedPosts(prev => {
                            const next = new Set(prev);
                            if (next.has(post.id)) next.delete(post.id); else next.add(post.id);
                            return next;
                          })}
                          className="mt-1 shrink-0"
                        >
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-amber-500" />
                            : <Square className="w-4 h-4 text-muted-foreground/40 hover:text-muted-foreground" />}
                        </button>
                      )}
                      <AuthorAvatar userId={post.user_id} name={post.author_name} />
                      <div className="flex-1 min-w-0">
                        {/* Author + meta */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold">{post.author_name}</span>
                          <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[post.category]}`}>
                            {t(`community.cat_${post.category}`)}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                            <Calendar className="w-3 h-3" />{formatDate(post.created_at)}
                          </span>
                          {/* Admin quick actions */}
                          {isAdmin && (
                            <div className="ml-auto flex items-center gap-1">
                              <button onClick={() => toggleArchivePost.mutate({ postId: post.id, archived: !isArchived })}
                                className="p-1 text-muted-foreground hover:text-amber-500 transition-colors rounded"
                                title={isArchived ? t('community.unarchive_post') : t('community.archive_post')}>
                                {isArchived ? <ArchiveRestore className="w-3 h-3" /> : <Archive className="w-3 h-3" />}
                              </button>
                              {(isAdmin || post.user_id === user?.id) && (
                                <button onClick={() => setDeletePostId(post.id)}
                                  className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Title — clickable to expand */}
                        <button
                          onClick={toggleExpand}
                          className="w-full text-left mt-1 group"
                        >
                          <h3 className="text-sm font-bold group-hover:text-primary transition-colors leading-snug">{post.title}</h3>
                        </button>

                        {/* Content — truncated in preview, full when expanded */}
                        <div
                          className={cn(
                            'text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-line cursor-pointer',
                            !isExpanded && 'line-clamp-3'
                          )}
                          onClick={toggleExpand}
                        >
                          {renderContent(post.content)}
                        </div>

                        {/* Stats + actions row */}
                        <div className="flex items-center gap-3 mt-3">
                          {/* Like */}
                          <div className="relative">
                            <button onClick={() => likePost.mutate(post)}
                              className={cn('flex items-center gap-1.5 text-xs transition-all duration-200 select-none',
                                isLiked ? 'text-rose-500 font-semibold' : 'text-muted-foreground hover:text-rose-400')}>
                              <Heart className={cn('w-4 h-4 transition-all duration-200',
                                isLiked && 'fill-rose-500 stroke-rose-500',
                                isAnimatingLike && 'animate-heart-like')} />
                              <span className={cn('tabular-nums', isAnimatingLike && 'scale-125 transition-transform')}>
                                {post.likes > 0 ? post.likes : ''}
                              </span>
                            </button>
                            {(heartParticles[post.id] || []).map((id, i) => (
                              <span key={id} className="absolute pointer-events-none text-rose-500 text-sm animate-heart-float"
                                style={{ bottom: '50%', left: '50%', '--tx': `${(i - 2.5) * 10}px`, '--delay': `${i * 70}ms` } as React.CSSProperties}>♥</span>
                            ))}
                          </div>
                          {/* Replies count */}
                          {post.replies_count > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MessageCircle className="w-3.5 h-3.5" />
                              {post.replies_count}
                            </span>
                          )}
                          {/* Views */}
                          {post.views > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Eye className="w-3.5 h-3.5" />
                              {post.views}
                            </span>
                          )}

                          {/* Voir la discussion / Réduire */}
                          <button
                            onClick={toggleExpand}
                            className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                          >
                            {isExpanded ? (
                              <><ChevronUp className="w-3.5 h-3.5" />Réduire</>
                            ) : (
                              <><ChevronDown className="w-3.5 h-3.5" />Voir la discussion</>
                            )}
                          </button>
                        </div>

                        {/* ── Expanded content ── */}
                        {isExpanded && (
                          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            {/* Replies */}
                            {(repliesByPost[post.id] || []).length > 0 && (
                              <div className="space-y-3 pl-4 border-l-2 border-border">
                                {(repliesByPost[post.id] || []).map(reply => (
                                  <div key={reply.id} className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold">{reply.author_name}</span>
                                      <span className="text-[10px] text-muted-foreground">{formatDate(reply.created_at)}</span>
                                      {reply.user_id !== user?.id && (
                                        <button onClick={() => { setReplyingTo(post.id); if (reply.user_id) mentionMapRef.current.set(reply.author_name, reply.user_id); setReplyContent(prev => `@${reply.author_name} ${prev}`); }}
                                          className="text-[10px] text-primary hover:underline">{t('community.mention')}</button>
                                      )}
                                      {(isAdmin || reply.user_id === user?.id) && (
                                        <button onClick={() => setDeleteReplyId(`${reply.id}::${post.id}`)}
                                          className="ml-auto text-muted-foreground hover:text-destructive transition-colors">
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">{renderContent(reply.content)}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Reply input — anchor for scroll */}
                            <div data-reply-anchor className="relative pt-3 border-t border-border">
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <Input ref={replyInputRef} value={replyContent} onChange={e => handleReplyChange(e.target.value)}
                                    placeholder={t('community.reply_placeholder')} className="text-sm"
                                    onKeyDown={e => {
                                      if (mentionQuery !== null && mentionSuggestions.length > 0) {
                                        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionSuggestions.length - 1)); return; }
                                        if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
                                        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex].author_name, mentionSuggestions[mentionIndex].user_id); return; }
                                        if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
                                      }
                                      if (e.key === 'Enter' && !e.shiftKey && replyContent.trim()) { e.preventDefault(); replyToPost.mutate(post.id); }
                                    }}
                                    onFocus={() => setReplyingTo(post.id)}
                                    onBlur={() => setTimeout(() => setMentionQuery(null), 150)} />
                                  {mentionQuery !== null && mentionSuggestions.length > 0 && (
                                    <div className="absolute bottom-full left-0 mb-1 w-full max-h-40 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-50 animate-in fade-in slide-in-from-bottom-1 duration-150">
                                      {mentionSuggestions.map((u, i) => (
                                        <button key={u.author_name} className={cn('w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent transition-colors', i === mentionIndex && 'bg-accent')}
                                          onMouseDown={e => { e.preventDefault(); insertMention(u.author_name, u.user_id); }}>
                                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><User className="w-3 h-3 text-primary" /></div>
                                          <div className="min-w-0">
                                            <span className="font-medium">{u.author_name}</span>
                                            {(u.role || u.club) && <span className="text-[10px] text-muted-foreground ml-1.5">{u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : ''}{u.role && u.club ? ' · ' : ''}{u.club || ''}</span>}
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <Button size="sm" variant="outline" onClick={() => replyToPost.mutate(post.id)}
                                  disabled={!replyContent.trim() || replyToPost.isPending || replyCooldown > 0}
                                  title={replyCooldown > 0 ? `${replyCooldown}s` : ''}>
                                  {replyCooldown > 0 ? <span className="text-[10px] font-mono">{replyCooldown}s</span> : <Send className="w-3.5 h-3.5" />}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
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
              onClick={() => {
                if (deletePostId === '__bulk__') {
                  bulkAction.mutate({ action: 'delete' });
                  setDeletePostId(null);
                } else {
                  deletePostId && deletePost.mutate(deletePostId);
                }
              }}
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
