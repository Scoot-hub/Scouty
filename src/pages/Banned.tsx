import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, LogOut, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logo from '@/assets/logo.png';

function formatRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return '';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}j ${h % 24}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function readLocalBanInfo(): { reason: string | null; expiresAt: string | null } {
  try {
    const raw = localStorage.getItem('scouthub_ban_info');
    return raw ? JSON.parse(raw) : { reason: null, expiresAt: null };
  } catch { return { reason: null, expiresAt: null }; }
}

export default function Banned() {
  const { t } = useTranslation();
  const { signOut, user } = useAuth();
  const [tick, setTick] = useState(0);

  // Ban info: from user session (if still active) OR from localStorage (set by BanGuard/login)
  const localInfo = readLocalBanInfo();
  const banStatus = {
    reason: user?.ban_reason ?? localInfo.reason,
    expiresAt: user?.ban_expires_at ?? localInfo.expiresAt,
  };

  // Live countdown
  useEffect(() => {
    if (!banStatus?.expiresAt) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [banStatus?.expiresAt]);

  // Auto-reload when ban expires
  useEffect(() => {
    if (!banStatus?.expiresAt) return;
    const ms = new Date(banStatus.expiresAt).getTime() - Date.now();
    if (ms > 0) {
      const id = setTimeout(() => window.location.href = '/', ms + 2000);
      return () => clearTimeout(id);
    }
  }, [banStatus?.expiresAt]);

  const isPermanent = !banStatus?.expiresAt;
  const remaining = banStatus?.expiresAt ? formatRemaining(banStatus.expiresAt) : null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">

        {/* Logo */}
        <img src={logo} alt="Scouty" className="w-14 h-14 rounded-2xl mx-auto opacity-60" />

        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
          <Shield className="w-10 h-10 text-destructive" />
        </div>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight">{t('ban.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('ban.subtitle')}</p>
        </div>

        {/* Details card */}
        <div className="rounded-2xl border bg-card p-5 text-left space-y-3">
          {banStatus?.reason && (
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{t('ban.reason')}</p>
                <p className="text-sm">{banStatus.reason}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{t('ban.duration')}</p>
              {isPermanent ? (
                <p className="text-sm font-semibold text-destructive">{t('ban.permanent')}</p>
              ) : remaining ? (
                <p className="text-sm font-semibold tabular-nums">
                  {t('ban.expires_in')} <span className="text-primary">{remaining}</span>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('ban.expiring_soon')}</p>
              )}
              {banStatus?.expiresAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(banStatus.expiresAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={signOut}
          >
            <LogOut className="w-4 h-4" />
            {t('ban.sign_out')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('ban.contact_support')}
          </p>
        </div>
      </div>
    </div>
  );
}
