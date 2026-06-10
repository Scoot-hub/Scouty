import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentOrg, useOrganizationMembers } from '@/hooks/use-organization';
import {
  useOrgMessages, useSendOrgMessage, useDeleteOrgMessage,
  useEditOrgMessage, useReactOrgMessage, useMarkOrgRead,
  useOrgTyping, useBroadcastTyping,
  useOrgChannels, useCreateOrgChannel, useDeleteOrgChannel,
  useChannelUnread, useMarkChannelRead,
  useOrgMessageSearch, useChannelPins, usePinMessage, useUnpinMessage,
  type OrgMessage, type OrgChannel,
} from '@/hooks/use-org-chat';
import OrgTabBar from '@/components/OrgTabBar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Send, ArrowDown, Reply, Smile, Trash2, Pencil, X, ChevronUp,
  AlertCircle, Loader2, Hash, Plus, Search, Pin, PinOff, MessageSquareOff, AtSign, User,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const MAX_CHARS = 512;
const EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 min

function renderWithMentions(text: string, isOwn = false, onMentionClick?: (name: string) => void) {
  const parts = text.split(/(@[\wÀ-ž][\wÀ-ž\s-]{0,29})/g);
  return parts.map((part, i) => {
    if (!/^@[\wÀ-ž]/.test(part)) return part;
    const name = part.slice(1); // strip @
    const className = isOwn
      ? 'font-bold bg-white/25 rounded-sm px-0.5'
      : 'text-violet-600 dark:text-violet-400 font-semibold';
    if (onMentionClick) {
      return (
        <button
          key={i}
          type="button"
          onClick={e => { e.stopPropagation(); onMentionClick(name); }}
          className={`${className} cursor-pointer hover:underline`}
        >
          {part}
        </button>
      );
    }
    return <span key={i} className={className}>{part}</span>;
  });
}

// Detect active @mention query at cursor position
function getMentionQuery(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([\wÀ-ÿ][\wÀ-ÿ\s]{0,25})$/);
  if (!match) return null;
  return { query: match[1].toLowerCase(), start: before.lastIndexOf('@') };
}

interface OrgMemberRaw { user_id: string; full_name?: string | null; email?: string; photo_url?: string | null; }

interface MentionDropdownProps {
  members: OrgMemberRaw[];
  query: string;
  onSelect: (name: string) => void;
}

function MentionDropdown({ members, query, onSelect }: MentionDropdownProps) {
  // Only use full_name — never use email (it contains @ which breaks mentions)
  const filtered = members
    .filter(m => {
      const name = (m.full_name?.trim() ?? '').toLowerCase();
      return name.length > 0 && name.includes(query);
    })
    .slice(0, 6);

  if (!filtered.length) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-64 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
      {filtered.map(m => {
        const name = m.full_name!.trim();
        return (
          <button
            key={m.user_id}
            onMouseDown={e => { e.preventDefault(); onSelect(name); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 transition-colors text-left"
          >
            <div className="w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0 text-[10px] font-bold text-violet-600 dark:text-violet-400">
              {name[0]?.toUpperCase()}
            </div>
            <span className="text-sm truncate">{name}</span>
          </button>
        );
      })}
    </div>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'À l\'instant';
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Group reactions: { emoji → Set<user_id> }
function groupReactions(reactions: OrgMessage['reactions']) {
  const map = new Map<string, Set<string>>();
  for (const r of reactions) {
    if (!map.has(r.emoji)) map.set(r.emoji, new Set());
    map.get(r.emoji)!.add(r.user_id);
  }
  return map;
}

interface MsgBubbleProps {
  msg: OrgMessage;
  isOwn: boolean;
  userId: string;
  onReply: (msg: OrgMessage) => void;
  onEdit: (msg: OrgMessage) => void;
  onDelete: (msgId: string) => void;
  onReact: (msgId: string, emoji: string) => void;
  isUnreadStart: boolean;
  isNew?: boolean;
  canPin?: boolean;
  isPinned?: boolean;
  onPin?: (msgId: string) => void;
  onUnpin?: (msgId: string) => void;
  showReactions?: boolean;
  showPinBtn?: boolean;
  onMentionClick?: (name: string) => void;
}

function MessageBubble({ msg, isOwn, userId, onReply, onEdit, onDelete, onReact, isUnreadStart, isNew, canPin, isPinned, onPin, onUnpin, showReactions = true, showPinBtn = true, onMentionClick }: MsgBubbleProps) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const isDeleted = !!msg.deleted_at;
  const canEdit = isOwn && !isDeleted && (Date.now() - new Date(msg.created_at).getTime()) < EDIT_WINDOW_MS;
  const canDelete = isOwn && !isDeleted;
  const reactions = groupReactions(msg.reactions ?? []);

  const handleRowLeave = (e: React.MouseEvent) => {
    if (!rowRef.current?.contains(e.relatedTarget as Node)) {
      setShowActions(false);
      setShowEmoji(false);
    }
  };

  return (
    <>
      {isUnreadStart && (
        <div className="flex items-center gap-3 my-3 px-2" data-unread-start>
          <div className="flex-1 h-px bg-primary/40" />
          <span className="text-[11px] text-primary font-semibold px-2 py-0.5 rounded-full bg-primary/10 whitespace-nowrap shrink-0">
            Nouveaux messages
          </span>
          <div className="flex-1 h-px bg-primary/40" />
        </div>
      )}

      {/* Row — hover state covers bubble + action buttons together */}
      <div
        ref={rowRef}
        className={cn(
          'flex gap-1.5 relative items-end',
          isOwn ? 'flex-row-reverse' : 'flex-row',
          isNew && 'animate-msg-in',
        )}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={handleRowLeave}
      >
        {/* Avatar (others only) */}
        {!isOwn && (
          <div className="shrink-0 mb-5">
            <PlayerAvatar name={msg.author_name} photoUrl={msg.author_photo} size="sm" />
          </div>
        )}

        {/* Message column */}
        <div className={cn('max-w-[65%] flex flex-col', isOwn ? 'items-end' : 'items-start')}>
          {!isOwn && (
            <span className="text-[11px] text-muted-foreground mb-0.5 ml-1">
              {msg.author_name}
            </span>
          )}

          {/* Reply preview */}
          {msg.reply_to_id && !isDeleted && (
            <div className={cn(
              'text-[11px] px-2 py-1 rounded-lg mb-1 border-l-2 border-primary/50 bg-muted/50 max-w-full',
              isOwn ? 'text-right' : ''
            )}>
              <span className="font-semibold text-primary/80">{msg.reply_author}</span>
              <p className="text-muted-foreground line-clamp-1">
                {msg.reply_content ?? '[message supprimé]'}
              </p>
            </div>
          )}

          {/* Bubble */}
          <div className={cn(
            'px-3 py-2 rounded-2xl text-sm leading-relaxed break-words',
            isDeleted
              ? 'italic text-muted-foreground bg-muted/40 border border-border/40'
              : isOwn
                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                : 'bg-card border border-border/60 rounded-tl-sm',
          )}>
            {isDeleted ? (
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" />
                Message supprimé
              </span>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{renderWithMentions(msg.content, isOwn, onMentionClick)}</p>
                {msg.edited_at && (
                  <span className="text-[10px] opacity-60 ml-1">(modifié)</span>
                )}
              </>
            )}
          </div>

          {/* Reactions */}
          {reactions.size > 0 && (
            <div className={cn('flex flex-wrap gap-1 mt-1', isOwn ? 'justify-end' : 'justify-start')}>
              {[...reactions.entries()].map(([emoji, users]) => (
                <button
                  key={`${emoji}-${users.size}`}
                  onClick={() => onReact(msg.id, emoji)}
                  className={cn(
                    'flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors animate-react-pop',
                    users.has(userId)
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-muted/50 border-border/40 text-muted-foreground hover:bg-muted'
                  )}
                >
                  <span>{emoji}</span>
                  <span className="font-medium tabular-nums">{users.size}</span>
                </button>
              ))}
            </div>
          )}

          <span className="text-[10px] text-muted-foreground mt-0.5 mx-1">
            {formatTime(msg.created_at)}
          </span>
        </div>

        {/* ── Inline action buttons (sibling to bubble column, never overlaps prev message) ── */}
        {!isDeleted && showActions && (
          <div className={cn(
            'flex items-center gap-0.5 shrink-0 self-center bg-card border border-border shadow-md rounded-xl px-1 py-0.5',
          )}>
            {showReactions && (
              <button
                onClick={() => setShowEmoji(v => !v)}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Réagir"
              >
                <Smile className="w-3.5 h-3.5" />
              </button>
            )}
            {!isOwn && (
              <button
                onClick={() => onReply(msg)}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Répondre"
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => onEdit(msg)}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Modifier"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(msg.id)}
                className="p-1 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {canPin && showPinBtn && (
              <button
                onClick={() => isPinned ? onUnpin?.(msg.id) : onPin?.(msg.id)}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title={isPinned ? 'Désépingler' : 'Épingler'}
              >
                {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        )}

        {/* Emoji picker — absolute from row, always visible */}
        {showReactions && showEmoji && (
          <div className={cn(
            'absolute bottom-7 z-30 flex gap-1 bg-card border border-border shadow-xl rounded-xl p-1.5',
            isOwn ? 'right-12' : 'left-12',
          )}>
            {EMOJI_LIST.map(e => (
              <button
                key={e}
                onClick={() => { onReact(msg.id, e); setShowEmoji(false); setShowActions(false); }}
                className="text-xl hover:scale-125 transition-transform p-0.5 rounded"
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OrgChat() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.id as string | undefined;
  const {
    chatEnabled, chatReactions, chatPins, chatSearch, chatMentions,
    chatFileAttachments, chatExternalLinks,
  } = useUiPreferences();

  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPins, setShowPins] = useState(false);

  const { data: channelsData } = useOrgChannels(orgId);
  const channels = channelsData?.channels ?? [];
  const createChannel = useCreateOrgChannel(orgId ?? '');
  const deleteChannel = useDeleteOrgChannel(orgId ?? '');
  const { data: unreadData } = useChannelUnread(orgId);
  const unreadMap = unreadData?.unread ?? {};
  const markChannelRead = useMarkChannelRead(orgId ?? '');
  const { data: searchData, isFetching: searchFetching } = useOrgMessageSearch(orgId, searchQuery);
  const searchResults = searchData?.messages ?? [];
  const { data: pinsData } = useChannelPins(orgId, selectedChannelId);
  const pinnedMessages = pinsData?.pins ?? [];
  const pinnedIds = useMemo(() => new Set(pinnedMessages.map(p => p.message_id)), [pinnedMessages]);
  const pinMsg = usePinMessage(orgId ?? '');
  const unpinMsg = useUnpinMessage(orgId ?? '');

  // Auto-select default channel on load
  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) {
      const def = channels.find(c => c.is_default) ?? channels[0];
      setSelectedChannelId(def.id);
    }
  }, [channels, selectedChannelId]);

  const isOrgAdmin = (org as any)?.myRole === 'owner' || (org as any)?.myRole === 'admin';

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    createChannel.mutate({ name: newChannelName.trim() }, {
      onSuccess: ch => {
        setShowNewChannel(false);
        setNewChannelName('');
        setSelectedChannelId(ch.id);
        toast.success(`Canal #${ch.name} créé`);
      },
      onError: () => toast.error('Impossible de créer le canal'),
    });
  };

  const handleDeleteChannel = (ch: OrgChannel) => {
    if (!confirm(`Supprimer le canal #${ch.name} ?`)) return;
    deleteChannel.mutate(ch.id, {
      onSuccess: () => {
        toast.success('Canal supprimé');
        if (selectedChannelId === ch.id) {
          const def = channels.find(c => c.is_default && c.id !== ch.id);
          setSelectedChannelId(def?.id ?? null);
        }
      },
      onError: () => toast.error('Impossible de supprimer ce canal'),
    });
  };

  const { data: pages, fetchPreviousPage, hasPreviousPage, isFetchingPreviousPage, isLoading } = useOrgMessages(orgId, selectedChannelId);
  const sendMsg = useSendOrgMessage(orgId ?? '');
  const deleteMsg = useDeleteOrgMessage(orgId ?? '');
  const editMsg = useEditOrgMessage(orgId ?? '');
  const reactMsg = useReactOrgMessage(orgId ?? '');
  const markRead = useMarkOrgRead(orgId ?? '');
  const { data: typingData } = useOrgTyping(orgId);
  const broadcastTyping = useBroadcastTyping(orgId);
  const typingUsers = typingData?.users ?? [];

  // @mentions
  const { data: membersData } = useOrganizationMembers(orgId);
  const orgMembers = (membersData ?? []) as OrgMemberRaw[];
  const [mentionState, setMentionState] = useState<{ query: string; start: number } | null>(null);
  const [mentionProfile, setMentionProfile] = useState<OrgMemberRaw | null>(null);

  // Map full_name (lowercase) → member for click resolution
  const memberByName = useMemo(() => {
    const map = new Map<string, OrgMemberRaw>();
    for (const m of orgMembers) {
      const name = m.full_name?.trim();
      if (name) map.set(name.toLowerCase(), m);
    }
    return map;
  }, [orgMembers]);

  const handleMentionProfileClick = (name: string) => {
    const key = name.trim().toLowerCase();
    const member = memberByName.get(key);
    if (member) setMentionProfile(member);
  };

  const handleMentionSelect = (name: string) => {
    if (!mentionState || !inputRef.current) return;
    const cursor = inputRef.current.selectionStart ?? input.length;
    const before = input.slice(0, mentionState.start);
    const after = input.slice(cursor);
    const newVal = `${before}@${name} ${after}`;
    setInput(newVal.slice(0, MAX_CHARS));
    setMentionState(null);
    // Restore focus and move cursor after the inserted mention
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      const pos = before.length + name.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const [input, setInput] = useState('');
  const [replyTo, setReplyTo] = useState<OrgMessage | null>(null);
  const [editTarget, setEditTarget] = useState<OrgMessage | null>(null);
  const [sendCooldown, setSendCooldown] = useState(0); // seconds remaining
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [unreadStartId, setUnreadStartId] = useState<string | null>(null);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const knownMsgIds = useRef<Set<string>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevScrollHeight = useRef(0);
  const didInitialScroll = useRef(false);
  const prevMsgCount = useRef(0);
  const prevFirstMsgId = useRef<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReadAt = pages?.pages?.[pages.pages.length - 1]?.messages?.[0]?.created_at ?? null;

  // Flatten all pages into one sorted array
  const messages = useMemo(() => {
    const all: OrgMessage[] = [];
    for (const page of pages?.pages ?? []) all.push(...page.messages);
    return all;
  }, [pages]);

  // Track new messages for entry animation (skip initial load)
  useEffect(() => {
    if (messages.length === 0) return;
    if (knownMsgIds.current.size === 0) {
      messages.forEach(m => knownMsgIds.current.add(m.id));
      return;
    }
    const incoming = messages.filter(m => !knownMsgIds.current.has(m.id));
    if (incoming.length > 0) {
      incoming.forEach(m => knownMsgIds.current.add(m.id));
      const ids = new Set(incoming.map(m => m.id));
      setAnimatingIds(ids);
      const t = setTimeout(() => setAnimatingIds(new Set()), 600);
      return () => clearTimeout(t);
    }
  }, [messages]);

  // Mark first unread message
  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/organizations/${orgId}/unread`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.last_read_at && messages.length > 0) {
          const firstUnread = messages.find(m => m.user_id !== user?.id && new Date(m.created_at) > new Date(d.last_read_at));
          setUnreadStartId(firstUnread?.id ?? null);
        }
      }).catch(() => {});
  }, [orgId, messages.length]);

  // Auto-scroll to bottom on first load
  useEffect(() => {
    if (messages.length > 0 && !didInitialScroll.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      didInitialScroll.current = true;
      if (orgId) markRead.mutate();
    }
  }, [messages.length]);

  // Auto-scroll on new own message
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Track scroll position for "scroll to bottom" button & load older
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(fromBottom > 200);

    // Load older messages when scrolled near top
    if (el.scrollTop < 100 && hasPreviousPage && !isFetchingPreviousPage && !prevScrollHeight.current) {
      prevScrollHeight.current = el.scrollHeight;
      fetchPreviousPage();
    }
  }, [hasPreviousPage, isFetchingPreviousPage, fetchPreviousPage]);



  // Single effect for all scroll management after messages change
  useEffect(() => {
    const el = containerRef.current;
    const count = messages.length;
    const firstId = messages[0]?.id ?? null;

    if (count > prevMsgCount.current && didInitialScroll.current) {
      const oldFirstId = prevFirstMsgId.current;
      if (oldFirstId !== null && firstId !== oldFirstId) {
        // First message changed → older messages were PREPENDED (user scrolled up to load older)
        if (el && prevScrollHeight.current) {
          el.scrollTop = el.scrollHeight - prevScrollHeight.current;
          prevScrollHeight.current = 0;
        }
      } else {
        // New messages APPENDED at the bottom → auto-scroll only if user is near bottom
        if (el) {
          const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (fromBottom < 200) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            if (orgId) markRead.mutate();
          }
        }
      }
    }

    prevMsgCount.current = count;
    prevFirstMsgId.current = firstId;
  }, [messages.length, messages[0]?.id]);

  // Mark as read when tab becomes active
  useEffect(() => {
    if (orgId && messages.length > 0) {
      markRead.mutate();
    }
  }, [orgId, messages.length]);

  const handleTyping = useCallback(() => {
    broadcastTyping.mutate();
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
  }, [broadcastTyping]);

  // Cleanup cooldown interval on unmount
  useEffect(() => () => { if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current); }, []);

  const startCooldown = (seconds: number) => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setSendCooldown(seconds);
    cooldownTimerRef.current = setInterval(() => {
      setSendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current!);
          cooldownTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || content.length > MAX_CHARS || sendCooldown > 0) return;
    // Guard: if the replied-to message was deleted in the meantime, clear the reply
    const safeReplyId = replyTo && !replyTo.deleted_at ? replyTo.id : undefined;
    setInput('');
    setReplyTo(null);
    setEditTarget(null);
    try {
      await sendMsg.mutateAsync({ content, reply_to_id: safeReplyId, channel_id: selectedChannelId });
      startCooldown(60);
      scrollToBottom();
    } catch (err: any) {
      if (err?.error === 'moderation_failed') {
        toast.error(t('org.chat_moderation_error'));
      } else if (err?.error === 'external_links_disabled') {
        toast.error('Les liens externes sont désactivés dans cette organisation.');
      } else if (err?.error === 'rate_limit') {
        const seconds = err.retry_after ?? 60;
        startCooldown(seconds);
        toast.error(t('org.chat_rate_limit', { seconds }));
      } else {
        toast.error(t('common.error'));
      }
      setInput(content); // restore on error
    }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    const content = input.trim();
    if (!content || content.length > MAX_CHARS) return;
    try {
      await editMsg.mutateAsync({ msgId: editTarget.id, content });
      setInput('');
      setEditTarget(null);
      inputRef.current?.focus();
    } catch (err: any) {
      if (err?.error === 'moderation_failed') toast.error(t('org.chat_moderation_error'));
      else toast.error(t('common.error'));
    }
  };

  const startEdit = (msg: OrgMessage) => {
    setEditTarget(msg);
    setReplyTo(null);
    setInput(msg.content);
    inputRef.current?.focus();
  };

  const cancelCompose = () => {
    setReplyTo(null);
    setEditTarget(null);
    setInput('');
  };

  const scrollToUnread = () => {
    const el = document.querySelector('[data-unread-start]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!org) return null;

  if (!chatEnabled) {
    return (
      <div className="space-y-4">
        <OrgTabBar orgName={org.name as string} />
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <MessageSquareOff className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold text-base">{t('settings.chat_disabled_notice')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('settings.chat_disabled_hint')}</p>
          </div>
          <Link to="/settings" className="text-xs text-primary hover:underline">{t('settings.chat_go_to_settings')}</Link>
        </div>
      </div>
    );
  }

  const orgSettings: Record<string, boolean> = (() => {
    try {
      const raw = (org as any).settings;
      if (!raw) return {};
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return {}; }
  })();
  const messagingDisabled = orgSettings.allow_messaging === false;
  const advancedChatEnabled = orgSettings.enable_advanced_chat !== false && (orgSettings.enable_advanced_chat === true || isOrgAdmin);
  const mentionsEnabled = orgSettings.enable_mentions === true;

  const remaining = MAX_CHARS - input.length;
  const canSend = input.trim().length > 0 && remaining >= 0 && !messagingDisabled;

  return (
    <div className="space-y-4">
      <OrgTabBar orgName={org.name as string} />

      {/* Member profile dialog — shown on mention click */}
      <Dialog open={!!mentionProfile} onOpenChange={v => { if (!v) setMentionProfile(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Profil du membre</DialogTitle>
          </DialogHeader>
          {mentionProfile && (
            <div className="flex flex-col items-center gap-3 py-2">
              <Avatar className="w-16 h-16">
                <AvatarImage src={mentionProfile.photo_url ?? undefined} />
                <AvatarFallback className="text-lg font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                  {mentionProfile.full_name?.[0]?.toUpperCase() ?? <User className="w-6 h-6" />}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <p className="font-semibold text-base">{mentionProfile.full_name}</p>
                {mentionProfile.email && (
                  <p className="text-xs text-muted-foreground mt-0.5">{mentionProfile.email}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New channel dialog */}
      <Dialog open={showNewChannel} onOpenChange={v => { if (!v) { setShowNewChannel(false); setNewChannelName(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau canal</DialogTitle>
          </DialogHeader>
          <Input
            value={newChannelName}
            onChange={e => setNewChannelName(e.target.value)}
            placeholder="nom-du-canal"
            maxLength={50}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleCreateChannel()}
          />
          <Button onClick={handleCreateChannel} disabled={!newChannelName.trim() || createChannel.isPending}>
            {createChannel.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Créer
          </Button>
        </DialogContent>
      </Dialog>

      <div className="flex h-[calc(100vh-260px)] min-h-[400px] border border-border rounded-2xl overflow-hidden bg-card">
        {/* Channel sidebar — only when advanced chat is enabled */}
        {advancedChatEnabled && <div className="w-44 shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="px-3 pt-3 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Canaux</span>
            {isOrgAdmin && (
              <button
                onClick={() => setShowNewChannel(true)}
                className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Nouveau canal"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5 px-1">
            {channels.map(ch => {
              const unread = unreadMap[ch.id] ?? 0;
              return (
                <div
                  key={ch.id}
                  className={cn(
                    'group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm',
                    selectedChannelId === ch.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  onClick={() => {
                    setSelectedChannelId(ch.id);
                    setShowPins(false);
                    markChannelRead.mutate(ch.id);
                  }}
                >
                  <Hash className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{ch.name}</span>
                  {unread > 0 && selectedChannelId !== ch.id && (
                    <span className="shrink-0 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                  {isOrgAdmin && !ch.is_default && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteChannel(ch); }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-destructive transition-all shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>}

        {/* Main chat area */}
        <div className="flex flex-col flex-1 min-w-0">
        {/* Channel header + search + pins — only when advanced chat is enabled */}
        {advancedChatEnabled && (
          <>
            <div className="h-11 shrink-0 border-b border-border flex items-center justify-between px-4 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Hash className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm truncate">
                  {channels.find(c => c.id === selectedChannelId)?.name ?? 'général'}
                </span>
                {pinnedMessages.length > 0 && !showPins && (
                  <span className="text-[10px] text-muted-foreground">· {pinnedMessages.length} épinglé{pinnedMessages.length > 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {chatPins && (
                  <button
                    onClick={() => { setShowPins(v => !v); setSearchOpen(false); }}
                    className={cn('p-1.5 rounded-lg transition-colors', showPins ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                    title="Messages épinglés"
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                )}
                {chatSearch && (
                  <button
                    onClick={() => { setSearchOpen(v => !v); setSearchQuery(''); setShowPins(false); }}
                    className={cn('p-1.5 rounded-lg transition-colors', searchOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
                    title="Rechercher"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Search bar */}
            {chatSearch && searchOpen && (
              <div className="shrink-0 border-b border-border p-2 space-y-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Rechercher dans les messages…"
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                {searchQuery.length >= 2 && (
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {searchFetching && <p className="text-xs text-muted-foreground text-center py-2">Recherche…</p>}
                    {!searchFetching && !searchResults.length && (
                      <p className="text-xs text-muted-foreground text-center py-2">Aucun résultat</p>
                    )}
                    {searchResults.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setSearchOpen(false)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold text-primary">{m.author_name}</span>
                          {m.channel_name && <span className="text-[10px] text-muted-foreground">#{m.channel_name}</span>}
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {new Date(m.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{m.content}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Pins panel */}
            {chatPins && showPins && (
              <div className="shrink-0 border-b border-border bg-amber-50/50 dark:bg-amber-900/10">
                <div className="px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <Pin className="w-3.5 h-3.5" />
                    Messages épinglés ({pinnedMessages.length})
                  </span>
                  <button onClick={() => setShowPins(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {!pinnedMessages.length ? (
              <p className="text-xs text-muted-foreground text-center pb-3">Aucun message épinglé dans ce canal</p>
            ) : (
              <div className="max-h-40 overflow-y-auto px-4 pb-2 space-y-1.5">
                {pinnedMessages.map(pin => (
                  <div key={pin.id} className="flex items-start gap-2 p-2 rounded-lg bg-card border border-amber-200/60 dark:border-amber-800/40 text-sm">
                    <Pin className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-muted-foreground">{pin.author_name}</p>
                      <p className="text-xs line-clamp-2">{pin.content}</p>
                    </div>
                    {isOrgAdmin && (
                      <button
                        onClick={() => unpinMsg.mutate({ channelId: selectedChannelId!, messageId: pin.message_id })}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        title="Désépingler"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
            )}
          </>
        )}

        {/* Messages area */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-3 scroll-smooth"
        >
          {/* Load older */}
          {hasPreviousPage && (
            <div className="flex justify-center py-2">
              <button
                onClick={() => {
                  if (!prevScrollHeight.current) {
                    prevScrollHeight.current = containerRef.current?.scrollHeight ?? 0;
                  }
                  fetchPreviousPage();
                }}
                disabled={isFetchingPreviousPage}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors"
              >
                {isFetchingPreviousPage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronUp className="w-3 h-3" />}
                Voir les messages précédents
              </button>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          )}

          {!isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 text-muted-foreground">
              <div className="text-4xl">💬</div>
              <p className="font-medium">{t('org.chat_empty_title')}</p>
              <p className="text-sm">{t('org.chat_empty_desc')}</p>
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.user_id === user?.id}
              userId={user?.id ?? ''}
              onReply={m => { setReplyTo(m); setEditTarget(null); inputRef.current?.focus(); }}
              onEdit={startEdit}
              onDelete={id => deleteMsg.mutate(id)}
              onReact={(msgId, emoji) => reactMsg.mutate({ msgId, emoji })}
              isUnreadStart={msg.id === unreadStartId}
              isNew={animatingIds.has(msg.id)}
              canPin={isOrgAdmin && !!selectedChannelId}
              isPinned={pinnedIds.has(msg.id)}
              onPin={msgId => pinMsg.mutate({ channelId: selectedChannelId!, messageId: msgId })}
              onUnpin={msgId => unpinMsg.mutate({ channelId: selectedChannelId!, messageId: msgId })}
              showReactions={chatReactions}
              showPinBtn={chatPins}
              onMentionClick={mentionsEnabled ? handleMentionProfileClick : undefined}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Floating: scroll to unread */}
        {unreadStartId && showScrollBtn && (
          <button
            onClick={scrollToUnread}
            className="absolute bottom-32 right-6 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-lg hover:bg-primary/90 transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            Nouveaux messages
          </button>
        )}

        {/* Floating: scroll to bottom */}
        {showScrollBtn && !unreadStartId && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-32 right-6 z-10 p-2 rounded-full bg-card border border-border shadow-lg hover:bg-muted transition-colors"
          >
            <ArrowDown className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-4 pb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="flex gap-0.5 items-end h-3">
              <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
            </span>
            {typingUsers.length === 1
              ? `${typingUsers[0].name} est en train d'écrire…`
              : typingUsers.length === 2
                ? `${typingUsers[0].name} et ${typingUsers[1].name} écrivent…`
                : `${typingUsers.length} membres écrivent…`
            }
          </div>
        )}

        {/* Compose area */}
        <div className="border-t border-border p-3 space-y-2 shrink-0">
          {messagingDisabled && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border/60 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              La messagerie a été désactivée par le propriétaire de l'organisation.
            </div>
          )}
          {/* Reply/edit preview */}
          {(replyTo || editTarget) && (
            <div className="flex items-start gap-2 px-3 py-2 bg-muted/50 rounded-xl border border-border/60">
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-primary">
                  {editTarget ? '✏️ Modifier' : `↩ ${replyTo?.author_name}`}
                </span>
                <p className="text-xs text-muted-foreground truncate">
                  {editTarget?.content ?? replyTo?.content}
                </p>
              </div>
              <button onClick={cancelCompose} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              {chatMentions && mentionsEnabled && mentionState && (
                <MentionDropdown
                  members={orgMembers}
                  query={mentionState.query}
                  onSelect={handleMentionSelect}
                />
              )}
              <Textarea
                ref={inputRef}
                value={input}
                onChange={e => {
                  const val = e.target.value.slice(0, MAX_CHARS);
                  setInput(val);
                  handleTyping();
                  if (mentionsEnabled) {
                    const cursor = e.target.selectionStart ?? val.length;
                    setMentionState(getMentionQuery(val, cursor));
                  } else {
                    setMentionState(null);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape' && mentionState && mentionsEnabled) {
                    e.preventDefault();
                    setMentionState(null);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (editTarget) handleEdit();
                    else if (sendCooldown === 0 && !messagingDisabled) handleSend();
                  }
                }}
                placeholder={messagingDisabled ? 'Messagerie désactivée' : t('org.chat_placeholder')}
                disabled={messagingDisabled}
                rows={1}
                className="resize-none rounded-xl pr-16 min-h-[42px] max-h-[120px] overflow-y-auto text-sm"
              />
              <span className={cn(
                'absolute bottom-2 right-2 text-[10px] tabular-nums',
                remaining < 50 ? 'text-destructive' : remaining < 100 ? 'text-amber-500' : 'text-muted-foreground/50'
              )}>
                {remaining}
              </span>
            </div>
            <Button
              size="sm"
              onClick={editTarget ? handleEdit : handleSend}
              disabled={!canSend || sendMsg.isPending || editMsg.isPending || (!editTarget && sendCooldown > 0)}
              className="rounded-xl h-[42px] px-3 shrink-0 relative"
              title={sendCooldown > 0 && !editTarget ? `Anti-spam : encore ${sendCooldown}s` : undefined}
            >
              {(sendMsg.isPending || editMsg.isPending)
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : sendCooldown > 0 && !editTarget
                  ? <span className="text-[11px] font-mono font-bold tabular-nums">{sendCooldown}s</span>
                  : <Send className="w-4 h-4" />
              }
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground px-1">
            {t('org.chat_hint')}{mentionsEnabled ? ' · Utilisez @nom pour mentionner un membre.' : ''}
          </p>
        </div>
        </div>{/* end main chat area */}
      </div>
    </div>
  );
}
