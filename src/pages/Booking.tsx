import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CAL_USERNAME = import.meta.env.VITE_CAL_USERNAME || '';
const CAL_EVENT_SLUG = import.meta.env.VITE_CAL_EVENT_SLUG || '';
const CAL_URL = import.meta.env.VITE_CAL_URL || 'https://cal.com';

export default function Booking() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const initDone = useRef(false);

  const calPath = `${CAL_USERNAME}${CAL_EVENT_SLUG ? `/${CAL_EVENT_SLUG}` : ''}`;
  const calLink = CAL_USERNAME ? `${CAL_URL}/${calPath}` : '';

  useEffect(() => {
    if (!CAL_USERNAME || initDone.current) return;
    initDone.current = true;

    interface CalApi {
      (...args: unknown[]): void;
      q: unknown[][];
      ns: Record<string, CalApi>;
      loaded: boolean;
    }
    const w = window as unknown as Window & { Cal: CalApi };

    // Step 1: Bootstrap the Cal queue (same logic as the official snippet, but executed directly)
    w.Cal = w.Cal || function (...args: unknown[]) {
      const cal = w.Cal;
      if (!cal.loaded) {
        cal.ns = {} as Record<string, CalApi>;
        cal.q = cal.q || [];
        const s = document.createElement('script');
        s.src = `${CAL_URL}/embed/embed.js`;
        s.async = true;
        document.head.appendChild(s);
        cal.loaded = true;
      }
      if (args[0] === 'init') {
        const api = function (...a: unknown[]) { api.q.push(a); } as unknown as CalApi;
        const namespace = args[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') {
          cal.ns[namespace] = cal.ns[namespace] || api;
          cal.ns[namespace].q.push(args);
          cal.q.push(['initNamespace', namespace]);
        } else {
          cal.q.push(args);
        }
        return;
      }
      cal.q.push(args);
    } as CalApi;
    w.Cal.q = w.Cal.q || [];
    w.Cal.ns = w.Cal.ns || {} as Record<string, CalApi>;
    w.Cal.loaded = w.Cal.loaded || false;

    // Step 2: Initialize namespace + inline embed
    w.Cal('init', 'booking', { origin: CAL_URL });
    w.Cal.ns.booking('inline', {
      elementOrSelector: '#cal-booking-inline',
      calLink: calPath,
      layout: 'month_view',
    });
    w.Cal.ns.booking('ui', {
      styles: { branding: { brandColor: '#6366f1' } },
      hideEventTypeDetails: false,
    });

    // Observe for Cal content injection
    const observer = new MutationObserver(() => {
      if (containerRef.current && containerRef.current.children.length > 0) {
        setLoading(false);
        observer.disconnect();
      }
    });
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }
    const timer = setTimeout(() => setLoading(false), 6000);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
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
{`# .env (local) ou Vercel > Settings > Environment Variables
VITE_CAL_USERNAME=votre-username-cal
VITE_CAL_EVENT_SLUG=consultation    # optionnel
VITE_CAL_URL=https://www.cal.eu     # ou https://cal.com`}
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

      <div className="rounded-xl border border-border overflow-hidden bg-background relative" style={{ minHeight: '700px' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
        <div id="cal-booking-inline" ref={containerRef} style={{ minHeight: '700px', width: '100%' }} />
      </div>
    </div>
  );
}
