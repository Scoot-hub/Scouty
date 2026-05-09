import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrentOrg } from '@/hooks/use-organization';
import {
  useOrgMessages, useSendOrgMessage, useDeleteOrgMessage,
  useEditOrgMessage, useReactOrgMessage, useMarkOrgRead,
  useOrgTyping, useBroadcastTyping,
  type OrgMessage,
} from '@/hooks/use-org-chat';
import OrgTabBar from '@/components/OrgTabBar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Send, ArrowDown, Reply, Smile, Trash2, Pencil, X, ChevronUp,
  AlertCircle, Loader2,
} from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/player-avatar';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const MAX_CHARS = 512;
const EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 min

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
}

function MessageBubble({ msg, isOwn, userId, onReply, onEdit, onDelete, onReact, isUnreadStart, isNew }: MsgBubbleProps) {
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
                <p className="whitespace-pre-wrap">{msg.content}</p>
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
            <button
              onClick={() => setShowEmoji(v => !v)}
              className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Réagir"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
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
          </div>
        )}

        {/* Emoji picker — absolute from row, always visible */}
        {showEmoji && (
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.id as string | undefined;

  const { data: pages, fetchPreviousPage, hasPreviousPage, isFetchingPreviousPage, isLoading } = useOrgMessages(orgId);
  const sendMsg = useSendOrgMessage(orgId ?? '');
  const deleteMsg = useDeleteOrgMessage(orgId ?? '');
  const editMsg = useEditOrgMessage(orgId ?? '');
  const reactMsg = useReactOrgMessage(orgId ?? '');
  const markRead = useMarkOrgRead(orgId ?? '');
  const { data: typingData } = useOrgTyping(orgId);
  const broadcastTyping = useBroadcastTyping(orgId);
  const typingUsers = typingData?.users ?? [];

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
      await sendMsg.mutateAsync({ content, reply_to_id: safeReplyId });
      startCooldown(60);
      scrollToBottom();
    } catch (err: any) {
      if (err?.error === 'moderation_failed') {
        toast.error(t('org.chat_moderation_error'));
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

  const remaining = MAX_CHARS - input.length;
  const canSend = input.trim().length > 0 && remaining >= 0;

  return (
    <div className="space-y-4">
      <OrgTabBar orgName={org.name as string} />

      <div className="flex flex-col h-[calc(100vh-260px)] min-h-[400px] border border-border rounded-2xl overflow-hidden bg-card">
        {/* Messages area */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 pt-12 pb-4 space-y-3 scroll-smooth"
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
              <Textarea
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value.slice(0, MAX_CHARS)); handleTyping(); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (editTarget) handleEdit();
                    else if (sendCooldown === 0) handleSend();
                  }
                }}
                placeholder={t('org.chat_placeholder')}
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
            {t('org.chat_hint')}
          </p>
        </div>
      </div>
    </div>
  );
}
