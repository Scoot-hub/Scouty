import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Bell, MessageSquare, Heart, Building2, Calendar, Star, Shield, Users, AlertTriangle } from 'lucide-react';
import type { Notification } from '@/hooks/use-notifications';
import { useMarkAsRead } from '@/hooks/use-notifications';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';

/* ── Blinking CSS animation injected once ── */
const BLINK_STYLE = `
@keyframes notif-ring {
  0%   { box-shadow: 0 0 0 0 rgba(var(--notif-ring-color,99,102,241), 0.55); }
  40%  { box-shadow: 0 0 0 8px rgba(var(--notif-ring-color,99,102,241), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--notif-ring-color,99,102,241), 0); }
}
.notif-blink {
  animation: notif-ring 0.9s ease-out 3;
}
`;

let styleInjected = false;
function ensureStyle() {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = BLINK_STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

/* ── Icon map ── */
const ICON_MAP: Record<string, React.ElementType> = {
  like: Heart,
  comment: MessageSquare,
  mention: MessageSquare,
  community: MessageSquare,
  organization: Building2,
  match_assignment: Calendar,
  assignment_confirmed: Calendar,
  subscription: Star,
  squad: Users,
  system: Bell,
  form_alert: AlertTriangle,
  report_reminder: AlertTriangle,
  affiliate_new: Star,
  affiliate_credits: Star,
  affiliate_tier: Star,
};

function notifIcon(type: string) {
  const Icon = ICON_MAP[type] ?? Bell;
  return <Icon className="w-4 h-4 shrink-0 mt-0.5" />;
}

/* ── Color accent by type ── */
const COLOR_MAP: Record<string, string> = {
  like: 'border-l-rose-400',
  comment: 'border-l-blue-400',
  mention: 'border-l-purple-400',
  community: 'border-l-blue-400',
  organization: 'border-l-emerald-400',
  match_assignment: 'border-l-orange-400',
  assignment_confirmed: 'border-l-green-400',
  system: 'border-l-primary',
  form_alert: 'border-l-amber-400',
  report_reminder: 'border-l-amber-400',
};

function accentColor(type: string) {
  return COLOR_MAP[type] ?? 'border-l-primary';
}

/* ── Single popup item ── */
interface PopupItemProps {
  notif: Notification;
  onDismiss: (id: string) => void;
}

function PopupItem({ notif, onDismiss }: PopupItemProps) {
  const navigate = useNavigate();
  const markAsRead = useMarkAsRead();
  const { notificationPopupDuration } = useUiPreferences();

  // Auto-dismiss after configured duration (0 = never)
  useEffect(() => {
    if (!notificationPopupDuration) return;
    const timer = setTimeout(() => onDismiss(notif.id), notificationPopupDuration * 1000);
    return () => clearTimeout(timer);
  }, [notif.id, onDismiss, notificationPopupDuration]);

  const handleClick = () => {
    onDismiss(notif.id);
    if (!notif.is_read) markAsRead.mutate(notif.id);
    if (notif.link) navigate(notif.link);
  };

  return (
    <div
      className={`notif-blink relative flex items-start gap-3 p-4 pr-8 bg-card border border-border border-l-4 ${accentColor(notif.type)} rounded-xl shadow-2xl cursor-pointer hover:bg-muted transition-colors max-w-sm w-full`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
    >
      <span className="text-primary mt-0.5">{notifIcon(notif.type)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug line-clamp-1">{notif.title}</p>
        {notif.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{notif.message}</p>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDismiss(notif.id); }}
        className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="Fermer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ── Stack container ── */
interface NotificationPopupProps {
  popups: Notification[];
  onDismiss: (id: string) => void;
}

export default function NotificationPopup({ popups, onDismiss }: NotificationPopupProps) {
  if (popups.length === 0) return null;

  ensureStyle();

  return (
    <div className="fixed bottom-5 right-5 z-[9998] flex flex-col gap-2 items-end pointer-events-none">
      {popups.map(n => (
        <div key={n.id} className="pointer-events-auto">
          <PopupItem notif={n} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
