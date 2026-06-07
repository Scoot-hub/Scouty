import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheck, ExternalLink, Loader2, Users, Clock, Mail,
  Timer, AlertTriangle, CheckCircle2, PhoneCall, CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CAL_USERNAME = import.meta.env.VITE_CAL_USERNAME || '';
const CAL_EVENT_SLUG = import.meta.env.VITE_CAL_EVENT_SLUG || '';
const CAL_URL = import.meta.env.VITE_CAL_URL || 'https://cal.com';

// ── Animation styles ─────────────────────────────────────────────────────────

const STYLES = `
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-6px); }
}
@keyframes slideLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.25); }
  70%  { box-shadow: 0 0 0 12px rgba(99,102,241,0); }
  100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
}
.anim-fade-up   { animation: fadeUp 0.55s cubic-bezier(.22,.68,0,1.2) both; }
.anim-fade-in   { animation: fadeIn 0.5s ease both; }
.anim-float     { animation: float 3.5s ease-in-out infinite; }
.anim-slide-l   { animation: slideLeft 0.5s cubic-bezier(.22,.68,0,1.2) both; }
.anim-scale-in  { animation: scaleIn 0.55s cubic-bezier(.22,.68,0,1.2) both; }
.anim-pulse-ring{ animation: pulse-ring 2s ease-out infinite; }
`;

// ── Info card ─────────────────────────────────────────────────────────────────

interface InfoCardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  delay?: string;
  accent?: string;
}

function InfoCard({ icon, title, desc, delay = '0ms', accent = 'bg-primary/10 text-primary' }: InfoCardProps) {
  return (
    <div
      className="anim-fade-up flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
      style={{ animationDelay: delay }}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', accent)}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ── Step chip ─────────────────────────────────────────────────────────────────

function Step({ n, label, delay }: { n: number; label: string; delay: string }) {
  return (
    <div className="anim-slide-l flex items-center gap-2.5" style={{ animationDelay: delay }}>
      <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
        {n}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
    return () => { observer.disconnect(); clearTimeout(timer); };
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
    <>
      <style>{STYLES}</style>

      <div className="max-w-5xl mx-auto py-8 px-4 space-y-10">

        {/* ── Hero ── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/8 via-background to-indigo-500/5 border px-5 sm:px-8 py-8 sm:py-10">
          {/* Decorative blobs */}
          <div className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/6 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-indigo-500/6 blur-3xl" />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="space-y-3">
              {/* Icon */}
              <div className="anim-float w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg anim-pulse-ring">
                <CalendarCheck className="w-7 h-7" />
              </div>

              <div className="anim-fade-up" style={{ animationDelay: '80ms' }}>
                <h1 className="text-3xl font-bold tracking-tight">{t('booking.title')}</h1>
                <p className="text-muted-foreground mt-1 max-w-lg">
                  Planifiez un échange avec notre équipe pour discuter de vos besoins en scouting,
                  vos projets ou toute question relative à la plateforme.
                </p>
              </div>
            </div>

            {calLink && (
              <div className="anim-fade-in shrink-0" style={{ animationDelay: '200ms' }}>
                <Button variant="outline" size="sm" asChild>
                  <a href={calLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {t('booking.open_external')}
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── Info cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard
            icon={<Users className="w-5 h-5" />}
            title="Équipe dédiée"
            desc="Notre planning est géré par 2 personnes. Chaque rendez-vous est suivi de bout en bout par un membre de l'équipe."
            delay="0ms"
            accent="bg-blue-500/10 text-blue-600"
          />
          <InfoCard
            icon={<Clock className="w-5 h-5" />}
            title="Délai de 48h"
            desc="Les créneaux réservés moins de 48h à l'avance ne peuvent pas être garantis. Nous vous contacterons pour confirmer."
            delay="80ms"
            accent="bg-amber-500/10 text-amber-600"
          />
          <InfoCard
            icon={<Mail className="w-5 h-5" />}
            title="Confirmation email"
            desc="Un email de confirmation vous est envoyé dès la validation de votre réservation avec tous les détails du rendez-vous."
            delay="160ms"
            accent="bg-green-500/10 text-green-600"
          />
          <InfoCard
            icon={<Timer className="w-5 h-5" />}
            title="Durée estimée"
            desc="Comptez entre 30 et 60 minutes selon vos besoins. Disponibilités du lundi au vendredi, 9h–18h."
            delay="240ms"
            accent="bg-purple-500/10 text-purple-600"
          />
        </div>

        {/* ── Warning + steps side by side ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Warning */}
          <div
            className="anim-scale-in rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-5 space-y-3"
            style={{ animationDelay: '100ms' }}
          >
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              À noter avant de réserver
            </div>
            <ul className="space-y-2 text-xs text-amber-800 dark:text-amber-300">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">•</span>
                Tout rendez-vous réservé <strong>moins de 48h à l'avance</strong> ne pourra être confirmé qu'après validation manuelle de notre part.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">•</span>
                En cas d'annulation, merci de nous prévenir <strong>au moins 24h avant</strong> le créneau pour permettre à quelqu'un d'autre de le prendre.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0">•</span>
                Si vous ne recevez pas de confirmation sous 12h, n'hésitez pas à nous contacter directement.
              </li>
            </ul>
          </div>

          {/* How it works */}
          <div
            className="anim-scale-in rounded-2xl border bg-card p-5 space-y-4"
            style={{ animationDelay: '180ms' }}
          >
            <p className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Comment ça marche ?
            </p>
            <div className="space-y-3">
              <Step n={1} label="Choisissez un créneau disponible dans le calendrier ci-dessous" delay="200ms" />
              <Step n={2} label="Renseignez vos informations et le motif de votre demande" delay="280ms" />
              <Step n={3} label="Recevez la confirmation par email avec le lien de connexion" delay="360ms" />
              <Step n={4} label="Notre équipe vous rejoint à l'heure convenue — on est là !" delay="440ms" />
            </div>
            <div className="pt-1 flex items-center gap-2 text-xs text-muted-foreground border-t">
              <PhoneCall className="w-3.5 h-3.5 text-green-500 shrink-0" />
              Rendez-vous en visioconférence ou par téléphone selon vos préférences
            </div>
          </div>
        </div>

        {/* ── Guarantee chips ── */}
        <div className="anim-fade-up flex flex-wrap gap-2" style={{ animationDelay: '300ms' }}>
          {[
            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'Gratuit & sans engagement' },
            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'Annulation libre 24h avant' },
            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'Confirmation email instantanée' },
            { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: '2 conseillers dédiés' },
          ].map(({ icon, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-xs bg-green-500/10 text-green-700 dark:text-green-400 px-3 py-1 rounded-full font-medium">
              {icon}{label}
            </span>
          ))}
        </div>

        {/* ── Calendar ── */}
        <div
          className="anim-scale-in rounded-2xl border border-border overflow-hidden bg-background shadow-sm relative"
          style={{ minHeight: '700px', animationDelay: '350ms' }}
        >
          {/* Header strip */}
          <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-medium">Choisissez votre créneau</span>
            <span className="text-xs text-muted-foreground ml-auto">Créneaux en temps réel · Fuseau horaire local</span>
          </div>

          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 z-10 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Chargement du calendrier…</p>
            </div>
          )}
          <div id="cal-booking-inline" ref={containerRef} style={{ minHeight: '700px', width: '100%' }} />
        </div>

        {/* ── Footer note ── */}
        <p className="anim-fade-in text-center text-xs text-muted-foreground pb-4" style={{ animationDelay: '500ms' }}>
          Des questions avant de réserver ?{' '}
          <a href="/contacts" className="text-primary underline underline-offset-2 hover:no-underline">
            Contactez-nous directement
          </a>{' '}
          — nous répondons sous 24h.
        </p>

      </div>
    </>
  );
}
