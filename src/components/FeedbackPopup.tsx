import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Star, X, MessageSquareHeart } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const FEEDBACK_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const FEEDBACK_STORAGE_KEY = 'scouthub_feedback_dismissed';

export default function FeedbackPopup() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (dismissed) return;

    const timer = setTimeout(() => {
      setOpen(true);
    }, FEEDBACK_DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setOpen(false);
    // Don't ask again for 7 days
    localStorage.setItem(FEEDBACK_STORAGE_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  };

  // Clear expired dismissal on mount
  useEffect(() => {
    const dismissed = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (dismissed && Number(dismissed) < Date.now()) {
      localStorage.removeItem(FEEDBACK_STORAGE_KEY);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    setSending(true);
    try {
      const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
      const res = await fetch(`${API_BASE}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          rating,
          message: message.trim() || null,
          page_url: window.location.href,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Server error');
      }

      setSent(true);
      toast.success(t('feedback.success'));
      // Auto-close after showing thank you
      setTimeout(() => {
        setOpen(false);
        localStorage.setItem(FEEDBACK_STORAGE_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000));
      }, 2000);
    } catch {
      toast.error(t('feedback.error'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <MessageSquareHeart className="w-12 h-12 text-primary" />
            <p className="text-lg font-semibold text-center">{t('feedback.thank_you')}</p>
            <p className="text-sm text-muted-foreground text-center">{t('feedback.thank_you_desc')}</p>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquareHeart className="w-5 h-5 text-primary" />
                {t('feedback.title')}
              </DialogTitle>
              <DialogDescription>{t('feedback.description')}</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Star Rating */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('feedback.rating_label')}</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-8 h-8 transition-colors ${
                          star <= (hoverRating || rating)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-muted-foreground/30'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Message */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {t('feedback.message_label')} <span className="text-muted-foreground font-normal">({t('feedback.optional')})</span>
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('feedback.message_placeholder')}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 resize-none"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={sending}>
                  {t('feedback.later')}
                </Button>
                <Button type="submit" disabled={sending || rating === 0}>
                  {t('feedback.submit')}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
