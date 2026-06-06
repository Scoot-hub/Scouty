import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/format-utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useMyTickets, useMyTicketDetail, useMyTicketReply } from '@/hooks/use-tickets';
import { useQueryClient } from '@tanstack/react-query';
import { moderateFields } from '@/lib/content-moderation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageSquare, Send, Loader2, CheckCircle, Clock, AlertCircle, ChevronLeft,
  Plus, X, Bug, Lightbulb, HelpCircle, ChevronDown, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

const statusBadge = (status: string, t: (k: string) => string) => {
  if (status === 'closed') return <Badge variant="secondary" className="text-[10px] gap-1"><CheckCircle className="w-3 h-3" /> {t('tickets.closed')}</Badge>;
  if (status === 'in_progress') return <Badge className="text-[10px] gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 border-0"><Clock className="w-3 h-3" /> {t('tickets.in_progress')}</Badge>;
  return <Badge className="text-[10px] gap-1 bg-blue-500/15 text-blue-600 hover:bg-blue-500/20 border-0"><AlertCircle className="w-3 h-3" /> {t('tickets.open')}</Badge>;
};

const CATEGORY_META: Record<string, { icon: typeof Bug; color: string }> = {
  bug:          { icon: Bug,         color: 'text-red-500' },
  feature:      { icon: Lightbulb,   color: 'text-amber-500' },
  other:        { icon: HelpCircle,  color: 'text-muted-foreground' },
  role_request: { icon: Shield,      color: 'text-violet-500' },
};

const ROLE_OPTIONS = ['influenceur', 'moderateur', 'importateur', 'redacteur'] as const;

// ── New ticket inline form ──────────────────────────────────────────────────
function NewTicketForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [requestedRole, setRequestedRole] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => { setSubject(''); setCategory('bug'); setMessage(''); setRequestedRole(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    if (category === 'role_request' && !requestedRole) { toast.error(t('tickets.select_role_required')); return; }
    if (!moderateFields(subject, message).clean) { toast.error(t('moderation.blocked')); return; }
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/report-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ category, subject: subject.trim(), message: message.trim(), url: window.location.href, userAgent: navigator.userAgent, requested_role: category === 'role_request' ? requestedRole : undefined }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Erreur'); }
      toast.success(t('report_issue.success'));
      reset();
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
      onCreated();
    } catch { toast.error(t('report_issue.error')); }
    finally { setSending(false); }
  };

  const CATS = [
    { value: 'bug',          label: t('report_issue.category_bug'),          Icon: Bug,        color: 'border-red-500/40 text-red-500 bg-red-500/5 hover:bg-red-500/10' },
    { value: 'feature',      label: t('report_issue.category_feature'),      Icon: Lightbulb,  color: 'border-amber-500/40 text-amber-500 bg-amber-500/5 hover:bg-amber-500/10' },
    { value: 'role_request', label: t('report_issue.category_role_request'), Icon: Shield,     color: 'border-violet-500/40 text-violet-500 bg-violet-500/5 hover:bg-violet-500/10' },
    { value: 'other',        label: t('report_issue.category_other'),        Icon: HelpCircle, color: 'border-border text-muted-foreground hover:bg-muted/50' },
  ];

  return (
    <Card className="card-warm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" />
          {t('tickets.new_ticket')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category picker */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CATS.map(({ value, label, Icon, color }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setCategory(value); if (value !== 'role_request') setRequestedRole(''); }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all',
                  category === value ? color + ' ring-1 ring-current' : 'border-border text-muted-foreground hover:bg-muted/50',
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Role selector (only for role_request) */}
          {category === 'role_request' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('tickets.role_request_select_label')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRequestedRole(role)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all',
                      requestedRole === role
                        ? 'border-violet-500/40 text-violet-600 bg-violet-500/10 ring-1 ring-violet-500/40'
                        : 'border-border text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    <Shield className="w-3.5 h-3.5 shrink-0" />
                    {t(`tickets.role_${role}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t('tickets.role_request_info')}</p>
            </div>
          )}

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('report_issue.subject')}
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={t('report_issue.subject_placeholder')}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('report_issue.message')}
            </label>
            <Textarea
              required
              rows={4}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('report_issue.message_placeholder')}
              className="rounded-xl resize-none text-sm"
            />
          </div>

          <p className="text-xs text-muted-foreground">{t('report_issue.context_info')}</p>

          <div className="flex justify-end gap-2">
            <Button
              type="submit"
              disabled={sending || !subject.trim() || !message.trim() || (category === 'role_request' && !requestedRole)}
              className="rounded-xl gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? t('report_issue.sending') : t('report_issue.send')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function MyTickets() {
  const { t } = useTranslation();
  const { dateFormat, timeFormat, timezone } = useUiPreferences();
  const { data: tickets = [], isLoading } = useMyTickets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  if (selectedId) {
    return <TicketChat ticketId={selectedId} onBack={() => {
      setSelectedId(null);
      // Refresh list now that the user is back — badge reflects actual unread state
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
    }} />;
  }

  const openCount = tickets.filter(t => t.status !== 'closed').length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('tickets.my_tickets')}</h1>
            <p className="text-sm text-muted-foreground">{t('tickets.my_tickets_desc')}</p>
          </div>
        </div>
        <Button
          onClick={() => setShowForm(v => !v)}
          variant={showForm ? 'outline' : 'default'}
          className="rounded-xl gap-2"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? t('common.cancel') : t('tickets.new_ticket')}
        </Button>
      </div>

      {/* New ticket form */}
      {showForm && (
        <NewTicketForm onCreated={() => setShowForm(false)} />
      )}

      {/* Ticket list */}
      <div>
        {/* Stats row */}
        {tickets.length > 0 && (
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-muted-foreground">{tickets.length} ticket{tickets.length > 1 ? 's' : ''}</span>
            {openCount > 0 && (
              <Badge className="text-[10px] bg-blue-500/15 text-blue-600 border-0">
                {openCount} {openCount > 1 ? t('tickets.open_plural') : t('tickets.open')}
              </Badge>
            )}
          </div>
        )}

        {tickets.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-20" />
              <p className="text-sm font-medium text-muted-foreground mb-1">{t('tickets.no_tickets')}</p>
              <p className="text-xs text-muted-foreground/60 mb-4">{t('tickets.no_tickets_hint')}</p>
              <Button size="sm" className="rounded-xl gap-2" onClick={() => setShowForm(true)}>
                <Plus className="w-4 h-4" />
                {t('tickets.new_ticket')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map(ticket => {
              const CatIcon = CATEGORY_META[ticket.category ?? 'other']?.icon ?? HelpCircle;
              const catColor = CATEGORY_META[ticket.category ?? 'other']?.color ?? 'text-muted-foreground';
              return (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedId(ticket.id)}
                  className="w-full text-left rounded-xl border border-border/60 bg-card p-4 hover:bg-muted/40 transition-colors group"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5 shrink-0', catColor)}>
                      <CatIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-semibold truncate">{ticket.subject}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {(ticket.unread_count ?? 0) > 0 && (
                            <span className="bg-primary text-primary-foreground text-[9px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                              {ticket.unread_count}
                            </span>
                          )}
                          {statusBadge(ticket.status, t)}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{ticket.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{formatDateTime(ticket.created_at, dateFormat, timeFormat, timezone)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Ticket chat ─────────────────────────────────────────────────────────────
function TicketChat({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { dateFormat, timeFormat, timezone } = useUiPreferences();
  const { data, isLoading } = useMyTicketDetail(ticketId);
  const replyMut = useMyTicketReply();
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages?.length]);

  // Once messages are visible, refresh the ticket list so the badge clears
  useEffect(() => {
    if (data) {
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
    }
  }, [data?.ticket?.id]);

  const handleReply = async () => {
    if (!msg.trim()) return;
    await replyMut.mutateAsync({ ticketId, body: msg.trim() });
    setMsg('');
    toast.success(t('tickets.reply_sent'));
  };

  if (isLoading || !data) return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const { ticket, messages } = data;
  const CatIcon = CATEGORY_META[ticket.category ?? 'other']?.icon ?? HelpCircle;
  const catColor = CATEGORY_META[ticket.category ?? 'other']?.color ?? 'text-muted-foreground';

  const roleRequestStatusBadge = () => {
    if (ticket.category !== 'role_request' || !ticket.role_request_status) return null;
    if (ticket.role_request_status === 'approved') return <Badge className="text-[10px] gap-1 bg-green-500/15 text-green-600 border-0"><CheckCircle className="w-3 h-3" /> {t('tickets.role_request_approved')}</Badge>;
    if (ticket.role_request_status === 'rejected') return <Badge className="text-[10px] gap-1 bg-red-500/15 text-red-600 border-0"><AlertCircle className="w-3 h-3" /> {t('tickets.role_request_rejected')}</Badge>;
    return <Badge className="text-[10px] gap-1 bg-violet-500/15 text-violet-600 border-0"><Clock className="w-3 h-3" /> {t('tickets.role_request_pending')}</Badge>;
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <CatIcon className={cn('w-4 h-4 shrink-0', catColor)} />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{ticket.subject}</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
            {formatDateTime(ticket.created_at, dateFormat, timeFormat, timezone)}
            {statusBadge(ticket.status, t)}
            {roleRequestStatusBadge()}
          </p>
        </div>
      </div>

      {/* Role request info banner */}
      {ticket.category === 'role_request' && ticket.requested_role && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-500/5 px-4 py-2.5">
          <Shield className="w-4 h-4 text-violet-500 shrink-0" />
          <span className="text-xs text-violet-700 dark:text-violet-400">
            {t('tickets.role_request_label')} : <strong>{t(`tickets.role_${ticket.requested_role}`)}</strong>
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-xl border bg-card px-4 py-4 space-y-3">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-tr-md px-4 py-2.5 bg-primary text-primary-foreground text-sm">
            <div className="whitespace-pre-wrap leading-relaxed">{ticket.message}</div>
            <div className="text-[9px] mt-1 text-primary-foreground/50">{formatDateTime(ticket.created_at, dateFormat, timeFormat, timezone)}</div>
          </div>
        </div>

        {messages.map(m => (
          <div key={m.id} className={cn('flex', m.is_admin ? 'justify-start' : 'justify-end')}>
            <div className={cn(
              'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
              m.is_admin ? 'bg-muted rounded-tl-md' : 'bg-primary text-primary-foreground rounded-tr-md',
            )}>
              {!!m.is_admin && <div className="text-[10px] text-muted-foreground mb-1 font-semibold">{t('tickets.admin_team')}</div>}
              <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
              <div className={cn('text-[9px] mt-1', m.is_admin ? 'text-muted-foreground' : 'text-primary-foreground/50')}>
                {formatDateTime(m.created_at, dateFormat, timeFormat, timezone)}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Reply input */}
      {ticket.status !== 'closed' ? (
        <div className="pt-3">
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
              disabled={!msg.trim() || replyMut.isPending}
              size="icon"
              className="rounded-xl h-[60px] w-[60px] shrink-0"
            >
              {replyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="pt-3 text-center">
          <p className="text-xs text-muted-foreground">{t('tickets.ticket_closed')}</p>
        </div>
      )}
    </div>
  );
}
