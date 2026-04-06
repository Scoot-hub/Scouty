import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Check, CheckCheck, Crown, FileSearch, Inbox, Sparkles, Trash2, Users, Zap, X, Heart, MessageCircle, AtSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead, useDeleteNotification, type Notification } from '@/hooks/use-notifications';
import { cn } from '@/lib/utils';

function getIcon(notification: Notification) {
  switch (notification.type) {
    case 'like':         return <Heart className="w-4 h-4" />;
    case 'comment':      return <MessageCircle className="w-4 h-4" />;
    case 'mention':      return <AtSign className="w-4 h-4" />;
    case 'enrichment':   return <Zap className="w-4 h-4" />;
    case 'subscription': return <Crown className="w-4 h-4" />;
    case 'player_news':  return <Sparkles className="w-4 h-4" />;
    default:             return <Bell className="w-4 h-4" />;
  }
}

function getTypeColor(type: string) {
  switch (type) {
    case 'like':         return 'text-rose-500 bg-rose-500/10';
    case 'comment':      return 'text-blue-500 bg-blue-500/10';
    case 'mention':      return 'text-purple-500 bg-purple-500/10';
    case 'enrichment':   return 'text-amber-500 bg-amber-500/10';
    case 'subscription': return 'text-primary bg-primary/10';
    case 'player_news':  return 'text-green-500 bg-green-500/10';
    default:             return 'text-muted-foreground bg-muted';
  }
}

function timeAgo(dateStr: string, t: (key: string, opts?: any) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('notifications.just_now');
  if (minutes < 60) return t('notifications.time_ago_minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.time_ago_hours', { count: hours });
  const days = Math.floor(hours / 24);
  return t('notifications.time_ago_days', { count: days });
}

export default function NotificationCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const unreadCount = useUnreadCount();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const deleteNotif = useDeleteNotification();

  const handleClick = (notif: Notification) => {
    if (!notif.is_read) markAsRead.mutate(notif.id);
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-accent transition-colors"
        aria-label={t('notifications.title')}
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-2rem)] bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-bold">{t('notifications.title')}</h3>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 px-2"
                    onClick={() => markAllAsRead.mutate()}
                  >
                    <CheckCheck className="w-3.5 h-3.5 mr-1" />
                    {t('notifications.mark_all_read')}
                  </Button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-accent transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Inbox className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">{t('notifications.empty')}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{t('notifications.empty_desc')}</p>
                </div>
              ) : (
                notifications.map(notif => (
                  <div
                    key={notif.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-accent/50 transition-colors cursor-pointer group',
                      !notif.is_read && 'bg-primary/[0.03]'
                    )}
                    onClick={() => handleClick(notif)}
                  >
                    {/* Icon */}
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', getTypeColor(notif.type))}>
                      {getIcon(notif)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-sm leading-tight', !notif.is_read ? 'font-semibold' : 'font-medium')}>
                          {notif.title}
                        </p>
                        {!notif.is_read && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                        )}
                      </div>
                      {notif.message && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(notif.created_at, t)}</p>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={e => { e.stopPropagation(); deleteNotif.mutate(notif.id); }}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
