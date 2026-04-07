import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import {
  useAdminTickets,
  useAdminTicketDetail,
  useAdminReplyTicket,
  useAdminSendTicketEmail,
  useAdminUpdateTicketStatus,
  type Ticket,
} from '@/hooks/use-tickets';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Navigate } from 'react-router-dom';
import {
  MessageSquare, Send, Mail, ChevronLeft, Loader2,
  CheckCircle, Clock, AlertCircle, Bug, Sparkles, HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const categoryIcon = (cat: string) => {
  if (cat === 'bug') return <Bug className="w-3.5 h-3.5" />;
  if (cat === 'feature') return <Sparkles className="w-3.5 h-3.5" />;
  return <HelpCircle className="w-3.5 h-3.5" />;
};

const statusBadge = (status: string, t: (k: string) => string) => {
  if (status === 'closed') return <Badge variant="secondary" className="text-[10px] gap-1"><CheckCircle className="w-3 h-3" /> {t('tickets.closed')}</Badge>;
  if (status === 'in_progress') return <Badge className="text-[10px] gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 border-0"><Clock className="w-3 h-3" /> {t('tickets.in_progress')}</Badge>;
  return <Badge className="text-[10px] gap-1 bg-red-500/15 text-red-600 hover:bg-red-500/20 border-0"><AlertCircle className="w-3 h-3" /> {t('tickets.open')}</Badge>;
};

export default function AdminTickets() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: tickets = [], isLoading } = useAdminTickets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'in_progress' | 'closed'>('all');

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  const filtered = filterStatus === 'all' ? tickets : tickets.filter(t => t.status === filterStatus);
  const openCount = tickets.filter(t => t.status === 'open').length;

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('tickets.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('tickets.subtitle', { count: tickets.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'open', 'in_progress', 'closed'] as const).map(s => (
            <Button
              key={s}
              variant={filterStatus === s ? 'default' : 'outline'}
              size="sm"
              className="rounded-xl text-xs"
              onClick={() => setFilterStatus(s)}
            >
              {t(`tickets.filter_${s}`)}
              {s === 'open' && openCount > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{openCount}</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Split view */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Ticket list */}
        <div className="w-full md:w-[380px] shrink-0 flex flex-col overflow-hidden rounded-xl border bg-card">
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">{t('tickets.empty')}</div>
            ) : (
              filtered.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedId(ticket.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b transition-colors hover:bg-muted/50',
                    selectedId === ticket.id && 'bg-primary/5 border-l-2 border-l-primary',
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {categoryIcon(ticket.category)}
                      <span className="text-sm font-semibold truncate max-w-[200px]">{ticket.subject}</span>
                    </div>
                    {(ticket.unread_count ?? 0) > 0 && (
                      <span className="bg-primary text-primary-foreground text-[9px] rounded-full w-5 h-5 flex items-center justify-center font-bold shrink-0">
                        {ticket.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground truncate">
                      {ticket.user_name || ticket.user_email || ticket.user_id.slice(0, 8)}
                    </span>
                    <div className="flex items-center gap-2">
                      {statusBadge(ticket.status, t)}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="flex-1 min-w-0 hidden md:flex">
          {selectedId ? (
            <ChatPanel ticketId={selectedId} onBack={() => setSelectedId(null)} />
          ) : (
            <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
              <div className="text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{t('tickets.select_ticket')}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────

function ChatPanel({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useAdminTicketDetail(ticketId);
  const reply = useAdminReplyTicket();
  const sendEmailMut = useAdminSendTicketEmail();
  const updateStatus = useAdminUpdateTicketStatus();
  const [msg, setMsg] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages?.length]);

  const handleReply = async () => {
    if (!msg.trim()) return;
    await reply.mutateAsync({ ticketId, body: msg.trim() });
    setMsg('');
    toast.success(t('tickets.reply_sent'));
  };

  const handleSendEmail = async () => {
    await sendEmailMut.mutateAsync(ticketId);
    toast.success(t('tickets.email_sent'));
  };

  const handleStatusChange = async (status: string) => {
    await updateStatus.mutateAsync({ ticketId, status });
    toast.success(t('tickets.status_updated'));
  };

  if (isLoading || !data) {
    return <div className="flex-1 flex items-center justify-center rounded-xl border bg-card"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  const { ticket, messages } = data;

  return (
    <div className="flex-1 flex flex-col rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="md:hidden"><ChevronLeft className="w-5 h-5" /></button>
            {categoryIcon(ticket.category)}
            <span className="font-bold text-sm">{ticket.subject}</span>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(ticket.status, t)}
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{ticket.user_name || ticket.user_email} · {new Date(ticket.created_at).toLocaleString()}</span>
          <div className="flex items-center gap-1.5">
            {ticket.status !== 'closed' && (
              <Button variant="outline" size="sm" className="text-[10px] h-6 rounded-lg" onClick={() => handleStatusChange('closed')}>
                <CheckCircle className="w-3 h-3 mr-1" />{t('tickets.close')}
              </Button>
            )}
            {ticket.status === 'closed' && (
              <Button variant="outline" size="sm" className="text-[10px] h-6 rounded-lg" onClick={() => handleStatusChange('open')}>
                {t('tickets.reopen')}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-[10px] h-6 rounded-lg"
              onClick={handleSendEmail}
              disabled={sendEmailMut.isPending}
            >
              <Mail className="w-3 h-3 mr-1" />
              {sendEmailMut.isPending ? '...' : t('tickets.send_email')}
            </Button>
          </div>
        </div>
        {ticket.page_url && (
          <div className="mt-1 text-[10px] text-muted-foreground truncate">
            Page : <a href={ticket.page_url} className="text-primary underline" target="_blank" rel="noreferrer">{ticket.page_url}</a>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Original ticket message */}
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-tl-md px-4 py-2.5 bg-muted text-sm">
            <div className="text-[10px] text-muted-foreground mb-1 font-semibold">{ticket.user_name || ticket.user_email}</div>
            <div className="whitespace-pre-wrap leading-relaxed">{ticket.message}</div>
            <div className="text-[9px] text-muted-foreground mt-1">{new Date(ticket.created_at).toLocaleString()}</div>
          </div>
        </div>

        {/* Conversation */}
        {messages.map(m => (
          <div key={m.id} className={cn('flex', m.is_admin ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
              m.is_admin
                ? 'bg-primary text-primary-foreground rounded-tr-md'
                : 'bg-muted rounded-tl-md',
            )}>
              <div className={cn('text-[10px] mb-1 font-semibold', m.is_admin ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                {m.is_admin ? (m.sender_name || t('tickets.admin_team')) : (m.sender_name || ticket.user_email)}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
              <div className={cn('text-[9px] mt-1', m.is_admin ? 'text-primary-foreground/50' : 'text-muted-foreground')}>
                {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Reply input */}
      {ticket.status !== 'closed' && (
        <div className="px-4 py-3 border-t bg-muted/20">
          <div className="flex gap-2">
            <Textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder={t('tickets.reply_placeholder')}
              className="rounded-xl min-h-[60px] max-h-[120px] resize-none text-sm"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleReply(); }}
            />
            <Button
              onClick={handleReply}
              disabled={!msg.trim() || reply.isPending}
              size="icon"
              className="rounded-xl h-[60px] w-[60px] shrink-0"
            >
              {reply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter {t('tickets.to_send')}</p>
        </div>
      )}
    </div>
  );
}
