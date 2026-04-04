import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { moderateFields } from '@/lib/content-moderation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface ReportIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export default function ReportIssueDialog({ open, onOpenChange }: ReportIssueDialogProps) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => {
    setSubject('');
    setCategory('bug');
    setMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;

    if (!moderateFields(subject, message).clean) {
      toast.error(t('moderation.blocked'));
      return;
    }

    setSending(true);
    try {
      const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
      const res = await fetch(`${API_BASE}/report-issue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          message: message.trim(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur serveur');
      }

      toast.success(t('report_issue.success'));
      reset();
      onOpenChange(false);
    } catch (err: any) {
      console.error('Report issue error:', err);
      toast.error(t('report_issue.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('report_issue.title')}</DialogTitle>
          <DialogDescription>{t('report_issue.description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('report_issue.category')}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <option value="bug">{t('report_issue.category_bug')}</option>
              <option value="feature">{t('report_issue.category_feature')}</option>
              <option value="other">{t('report_issue.category_other')}</option>
            </select>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('report_issue.subject')}</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('report_issue.subject_placeholder')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>

          {/* Message */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('report_issue.message')}</label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('report_issue.message_placeholder')}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
            />
          </div>

          <p className="text-xs text-muted-foreground">{t('report_issue.context_info')}</p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              {t('report_issue.cancel')}
            </Button>
            <Button type="submit" disabled={sending || !subject.trim() || !message.trim()}>
              {sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {sending ? t('report_issue.sending') : t('report_issue.send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
