import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Cal.com configuration — set via environment variables
const CAL_USERNAME = import.meta.env.VITE_CAL_USERNAME || '';
const CAL_EVENT_SLUG = import.meta.env.VITE_CAL_EVENT_SLUG || '';
const CAL_URL = import.meta.env.VITE_CAL_URL || 'https://cal.com';

export default function Booking() {
  const { t } = useTranslation();
  const embedRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef(false);

  const calLink = CAL_USERNAME
    ? `${CAL_URL}/${CAL_USERNAME}${CAL_EVENT_SLUG ? `/${CAL_EVENT_SLUG}` : ''}`
    : '';

  useEffect(() => {
    if (!CAL_USERNAME || scriptLoaded.current) return;

    // Load Cal.com embed script
    const script = document.createElement('script');
    script.src = `${CAL_URL}/embed/embed.js`;
    script.async = true;
    script.onload = () => {
      scriptLoaded.current = true;
      // Initialize Cal inline embed
      if ((window as any).Cal) {
        (window as any).Cal('init', { origin: CAL_URL });
        (window as any).Cal('inline', {
          elementOrSelector: '#cal-embed',
          calLink: `${CAL_USERNAME}${CAL_EVENT_SLUG ? `/${CAL_EVENT_SLUG}` : ''}`,
          layout: 'month_view',
          config: {
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
          },
        });
        (window as any).Cal('ui', {
          styles: { branding: { brandColor: '#6366f1' } },
          hideEventTypeDetails: false,
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup on unmount
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  if (!CAL_USERNAME) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4">
        <div className="text-center space-y-4">
          <CalendarCheck className="w-12 h-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">{t('booking.title')}</h1>
          <p className="text-muted-foreground">{t('booking.not_configured')}</p>
          <pre className="mt-6 text-left bg-muted rounded-lg p-4 text-xs overflow-x-auto">
{`# .env
VITE_CAL_USERNAME=votre-username-cal
VITE_CAL_EVENT_SLUG=consultation    # optionnel
VITE_CAL_URL=https://cal.com        # ou votre instance self-hosted`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <CalendarCheck className="w-6 h-6" />
            {t('booking.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('booking.subtitle')}</p>
        </div>
        {calLink && (
          <Button variant="outline" size="sm" asChild>
            <a href={calLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('booking.open_external')}
            </a>
          </Button>
        )}
      </div>

      <div
        id="cal-embed"
        ref={embedRef}
        className="rounded-xl border border-border overflow-hidden bg-background"
        style={{ minHeight: '600px', width: '100%' }}
      />
    </div>
  );
}
