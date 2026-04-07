import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyTickets, useMyTicketDetail, useMyTicketReply } from '@/hooks/use-tickets';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  MessageSquare, Send, Loader2, CheckCircle, Clock, AlertCircle, ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const statusBadge = (status: string, t: (k: string) => string) => {
  if (status === 'closed') return <Badge variant="secondary" className="text-[10px] gap-1"><CheckCircle className="w-3 h-3" /> {t('tickets.closed')}</Badge>;
  if (status === 'in_progress') return <Badge className="text-[10px] gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 border-0"><Clock className="w-3 h-3" /> {t('tickets.in_progress')}</Badge>;
  return <Badge className="text-[10px] gap-1 bg-blue-500/15 text-blue-600 hover:bg-blue-500/20 border-0"><AlertCircle className="w-3 h-3" /> {t('tickets.open')}</Badge>;
};

export default function MyTickets() {
  const { t } = useTranslation();
  const { data: tickets = [], isLoading } = useMyTickets();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  if (selectedId) {
    return <TicketChat ticketId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <MessageSquare className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('tickets.my_tickets')}</h1>
          <p className="text-sm text-muted-foreground">{t('tickets.my_tickets_desc')}</p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">{t('tickets.no_tickets')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => setSelectedId(ticket.id)}
              className="w-full text-left rounded-xl border p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{ticket.subject}</span>
                <div className="flex items-center gap-2">
                  {(ticket.unread_count ?? 0) > 0 && (
                    <span className="bg-primary text-primary-foreground text-[9px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {ticket.unread_count}
                    </span>
                  )}
                  {statusBadge(ticket.status, t)}
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{ticket.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{new Date(ticket.created_at).toLocaleString()}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketChat({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useMyTicketDetail(ticketId);
  const replyMut = useMyTicketReply();
  const [msg, setMsg] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data?.messages?.length]);

  const handleReply = async () => {
    if (!msg.trim()) return;
    await replyMut.mutateAsync({ ticketId, body: msg.trim() });
    setMsg('');
    toast.success(t('tickets.reply_sent'));
  };

  if (isLoading || !data) return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  const { ticket, messages } = data;

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{ticket.subject}</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            {new Date(ticket.created_at).toLocaleString()} {statusBadge(ticket.status, t)}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-xl border bg-card px-4 py-4 space-y-3">
        {/* Original message */}
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-tr-md px-4 py-2.5 bg-primary text-primary-foreground text-sm">
            <div className="whitespace-pre-wrap leading-relaxed">{ticket.message}</div>
            <div className="text-[9px] mt-1 text-primary-foreground/50">{new Date(ticket.created_at).toLocaleString()}</div>
          </div>
        </div>

        {messages.map(m => (
          <div key={m.id} className={cn('flex', m.is_admin ? 'justify-start' : 'justify-end')}>
            <div className={cn(
              'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
              m.is_admin ? 'bg-muted rounded-tl-md' : 'bg-primary text-primary-foreground rounded-tr-md',
            )}>
              {m.is_admin && <div className="text-[10px] text-muted-foreground mb-1 font-semibold">{t('tickets.admin_team')}</div>}
              <div className="whitespace-pre-wrap leading-relaxed">{m.body}</div>
              <div className={cn('text-[9px] mt-1', m.is_admin ? 'text-muted-foreground' : 'text-primary-foreground/50')}>
                {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Reply input */}
      {ticket.status !== 'closed' && (
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
      )}

      {ticket.status === 'closed' && (
        <div className="pt-3 text-center">
          <p className="text-xs text-muted-foreground">{t('tickets.ticket_closed')}</p>
        </div>
      )}
    </div>
  );
}
