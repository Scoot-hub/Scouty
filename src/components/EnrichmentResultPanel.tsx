import { useEffect, useRef, useState, useCallback } from 'react';
import { useEscapeKey } from '@/hooks/use-escape-key';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw, X, ArrowRight, Building2, Calendar, Briefcase, Globe,
  User, TrendingUp, Ruler, Camera, Award, Hash, MapPin, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EnrichChange {
  field: string;
  old: string | null;
  new: string | null;
}

interface Props {
  changes: EnrichChange[];
  onClose: () => void;
}

const AUTO_DISMISS_MS = 9000;

const FIELD_META: Record<string, { label: string; icon: React.ElementType }> = {
  club:          { label: 'Club',              icon: Building2 },
  contract:      { label: 'Contrat',           icon: Calendar },
  agent:         { label: 'Agent',             icon: Briefcase },
  date_of_birth: { label: 'Naissance',         icon: Calendar },
  nationality:   { label: 'Nationalité',       icon: Globe },
  position:      { label: 'Poste',             icon: User },
  market_value:  { label: 'Valeur marchande',  icon: TrendingUp },
  height:        { label: 'Taille',            icon: Ruler },
  photo:         { label: 'Photo',             icon: Camera },
  photo_url:     { label: 'Photo',             icon: Camera },
  shirt_number:  { label: 'Numéro',            icon: Hash },
  birth_location:{ label: 'Lieu de naissance', icon: MapPin },
  description:   { label: 'Biographie',        icon: Award },
};

type Phase = 'entering' | 'visible' | 'leaving';

export default function EnrichmentResultPanel({ changes, onClose }: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('entering');
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef   = useRef<number | null>(null);
  const startRef = useRef<number>(Date.now());

  // Entry animation → then start progress bar
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 50);
    startRef.current = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(pct);
      if (pct > 0) rafRef.current = requestAnimationFrame(tick);
      else handleClose();
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      clearTimeout(t1);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    if (phase === 'leaving') return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setPhase('leaving');
    timerRef.current = setTimeout(onClose, 550);
  }, [phase, onClose]);

  useEscapeKey(handleClose, phase !== 'leaving');

  return (
    <>
      {/* Invisible tap-to-close backdrop */}
      <div className="fixed inset-0 z-[200]" onClick={handleClose} />

      {/* Panel */}
      <div
        className={cn(
          'fixed bottom-6 right-6 z-[201] w-[380px] max-w-[calc(100vw-3rem)]',
          'rounded-2xl shadow-2xl border bg-background/95 backdrop-blur-sm overflow-hidden',
          'transition-all duration-500 ease-out',
          phase === 'entering' && 'opacity-0 translate-y-8 scale-95',
          phase === 'visible'  && 'opacity-100 translate-y-0 scale-100',
          phase === 'leaving'  && 'opacity-0 translate-y-6 scale-95',
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted overflow-hidden rounded-t-2xl">
          <div
            className="h-full bg-primary transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-3">
          {/* Animated icon */}
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              'bg-primary/10 border border-primary/20',
              'transition-all duration-300',
              phase === 'entering' && 'enrich-icon-enter',
              phase === 'leaving'  && 'enrich-icon-leave',
            )}
            style={{ boxShadow: phase === 'visible' ? '0 0 0 4px hsl(var(--primary)/0.08)' : undefined }}
          >
            <RefreshCw
              className={cn(
                'w-5 h-5 text-primary transition-transform duration-300',
                phase === 'entering' && 'animate-spin',
                phase === 'leaving'  && 'animate-spin',
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">
              {t('profile.enrich_panel_title', 'Enrichissement terminé')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {changes.length === 1
                ? t('profile.enrich_panel_count_one', '1 donnée mise à jour')
                : t('profile.enrich_panel_count', { count: changes.length, defaultValue: '{{count}} données mises à jour' })}
            </p>
          </div>

          {/* Close */}
          <button
            onClick={handleClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Changes list */}
        <div className="px-4 pb-4 space-y-2 max-h-72 overflow-y-auto">
          {changes.map((c, i) => {
            const meta = FIELD_META[c.field];
            const Icon = meta?.icon ?? CheckCircle2;
            const label = meta?.label ?? c.field;
            const isNew = !c.old;

            return (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 rounded-xl px-3 py-2.5',
                  'bg-muted/50 border border-transparent',
                  'transition-all duration-300',
                  'enrich-change-item',
                )}
                style={{ animationDelay: `${i * 60 + 200}ms` }}
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
                  {isNew ? (
                    <p className="text-sm font-medium text-foreground truncate">{c.new}</p>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground/60 line-through truncate max-w-[100px]">{c.old}</span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                      <span className="text-sm font-medium text-primary truncate">{c.new}</span>
                    </div>
                  )}
                </div>
                {isNew && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500 bg-emerald-500/10 rounded-md px-1.5 py-0.5 shrink-0 mt-0.5">
                    {t('profile.enrich_new', 'Nouveau')}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes enrich-icon-enter {
          0%   { transform: rotate(-180deg) scale(0.6); opacity: 0; }
          60%  { transform: rotate(20deg) scale(1.1); opacity: 1; }
          100% { transform: rotate(0deg) scale(1); opacity: 1; }
        }
        @keyframes enrich-icon-leave {
          0%   { transform: rotate(0deg) scale(1); }
          100% { transform: rotate(360deg) scale(0.6); opacity: 0; }
        }
        @keyframes enrich-change-in {
          from { opacity: 0; transform: translateX(8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .enrich-icon-enter {
          animation: enrich-icon-enter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .enrich-icon-leave {
          animation: enrich-icon-leave 0.5s ease-in forwards;
        }
        .enrich-change-item {
          animation: enrich-change-in 0.3s ease-out both;
        }
      `}</style>
    </>
  );
}
