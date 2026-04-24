import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Cookie, ChevronDown, ChevronUp, Lock, BarChart3, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  functional: boolean;
}

const STORAGE_KEY = 'scouthub_cookie_consent';
const DEFAULT_CONSENT: CookieConsent = { necessary: true, analytics: false, functional: false };

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCookieConsent(): CookieConsent | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as CookieConsent; } catch { return null; }
}

function saveConsent(consent: CookieConsent) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
}

// ── Banner ───────────────────────────────────────────────────────────────────

export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [prefs, setPrefs] = useState<Omit<CookieConsent, 'necessary'>>({
    analytics: false,
    functional: false,
  });

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    saveConsent({ necessary: true, analytics: true, functional: true });
    setVisible(false);
  };

  const refuse = () => {
    saveConsent(DEFAULT_CONSENT);
    setVisible(false);
  };

  const saveCustom = () => {
    saveConsent({ necessary: true, ...prefs });
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-4 animate-in slide-in-from-bottom-4 duration-300">
      <div className="max-w-2xl mx-auto bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Cookie className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground mb-0.5">{t('cookie_banner.title')}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t('cookie_banner.text')}{' '}
                <Link to="/privacy" className="text-primary hover:underline font-medium">
                  {t('cookie_banner.learn_more')}
                </Link>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button size="sm" onClick={accept} className="flex-1 sm:flex-none">
              {t('cookie_banner.accept_all')}
            </Button>
            <Button size="sm" variant="outline" onClick={refuse} className="flex-1 sm:flex-none">
              {t('cookie_banner.refuse_all')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCustomizing(v => !v)}
              className="flex-1 sm:flex-none text-muted-foreground gap-1.5"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {t('cookie_banner.customize')}
              {customizing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Customization panel */}
        {customizing && (
          <div className="border-t border-border bg-muted/30 p-5 space-y-3">
            {/* Nécessaires — toujours actifs */}
            <CookieCategory
              icon={<Lock className="w-4 h-4 text-green-500" />}
              label={t('cookie_banner.cat_necessary')}
              description={t('cookie_banner.cat_necessary_desc')}
              enabled={true}
              locked
            />

            {/* Analytiques */}
            <CookieCategory
              icon={<BarChart3 className="w-4 h-4 text-blue-500" />}
              label={t('cookie_banner.cat_analytics')}
              description={t('cookie_banner.cat_analytics_desc')}
              enabled={prefs.analytics}
              onChange={v => setPrefs(p => ({ ...p, analytics: v }))}
            />

            {/* Fonctionnels */}
            <CookieCategory
              icon={<Settings2 className="w-4 h-4 text-purple-500" />}
              label={t('cookie_banner.cat_functional')}
              description={t('cookie_banner.cat_functional_desc')}
              enabled={prefs.functional}
              onChange={v => setPrefs(p => ({ ...p, functional: v }))}
            />

            <Button size="sm" onClick={saveCustom} className="w-full mt-1">
              {t('cookie_banner.save_prefs')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category row ─────────────────────────────────────────────────────────────

function CookieCategory({
  icon,
  label,
  description,
  enabled,
  locked = false,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  locked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-background border border-border/60">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{label}</span>
          {locked && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">
              Toujours actif
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
      {/* Toggle */}
      <button
        type="button"
        disabled={locked}
        onClick={() => onChange?.(!enabled)}
        className={cn(
          'relative shrink-0 mt-0.5 w-10 h-5.5 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          enabled ? 'bg-primary' : 'bg-muted-foreground/30',
          locked && 'opacity-60 cursor-not-allowed'
        )}
        aria-checked={enabled}
        role="switch"
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            enabled ? 'translate-x-4.5' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
}
