import { Link, useLocation } from 'react-router-dom';
import { Users, UserSquare2, Map, Settings, Building2, MessageSquare, Lock, LayoutDashboard, ListChecks, BarChart2, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugify, useCurrentOrg } from '@/hooks/use-organization';
import { Badge } from '@/components/ui/badge';
import { useOrgUnread } from '@/hooks/use-org-chat';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OrgTabBarProps {
  orgName: string;
}

const TABS = [
  { key: 'dashboard', label: 'Tableau de bord',  icon: LayoutDashboard, path: 'dashboard', settingKey: 'enable_dashboard',  premium: false },
  { key: 'squad',     label: 'Effectif',          icon: Users,           path: 'squad',     settingKey: 'allow_squad_viewing', premium: false },
  { key: 'players',   label: 'Joueurs',           icon: UserSquare2,     path: 'players',   settingKey: null,                 premium: false },
  { key: 'shortlist', label: 'Shortlist',         icon: ListChecks,      path: 'shortlist', settingKey: 'enable_shortlist',   premium: true  },
  { key: 'roadmap',   label: 'Feuille de route',  icon: Map,             path: 'roadmap',   settingKey: null,                 premium: false },
  { key: 'chat',      label: 'Discussion',        icon: MessageSquare,   path: 'chat',      settingKey: null,                 premium: false },
  { key: 'analytics', label: 'Analytics',         icon: BarChart2,       path: 'analytics', settingKey: 'enable_analytics',   premium: true  },
  { key: 'settings',  label: 'Paramètres',        icon: Settings,        path: 'settings',  settingKey: null,                 premium: false },
] as const;

const ORG_TYPE_LABELS: Record<string, string> = {
  club: 'Club',
  agency: 'Agence',
  scout_group: 'Groupe de scouts',
  other: 'Autre',
};

export default function OrgTabBar({ orgName }: OrgTabBarProps) {
  const { pathname } = useLocation();
  const base = `/organization/${slugify(orgName)}`;
  const { data: org } = useCurrentOrg();
  const orgId = org?.id as string | undefined;
  const { data: unreadData } = useOrgUnread(orgId);
  const unreadCount = unreadData?.count ?? 0;

  const orgSettings: Record<string, boolean> = (() => {
    try {
      const raw = org?.settings;
      if (!raw) return {};
      return typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, boolean>);
    } catch { return {}; }
  })();
  const isAdmin = org?.myRole === 'owner' || org?.myRole === 'admin';

  // Determine visibility/lock state for each tab
  const tabState = (settingKey: string | null, tabKey: string): 'visible' | 'locked' | 'hidden' => {
    if (!settingKey) return 'visible';
    // squad: special case — blocked for non-admins if setting is false
    if (tabKey === 'squad') {
      return orgSettings.allow_squad_viewing === false && !isAdmin ? 'locked' : 'visible';
    }
    // Other setting-gated tabs (dashboard, shortlist, analytics):
    // default true for dashboard, false for premium tabs unless explicitly set
    const defaultOn = tabKey === 'dashboard';
    const enabled = settingKey in orgSettings ? orgSettings[settingKey] : defaultOn;
    if (enabled) return 'visible';
    // Admins see it locked (can still click & go enable it), non-admins: hidden
    return isAdmin ? 'locked' : 'hidden';
  };

  return (
    <div className="space-y-4">
      {/* ── Persistent org header ── */}
      {org && (
        <div className="flex items-start gap-4 pb-4 border-b border-border">
          {/* Logo */}
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-border/50 overflow-hidden flex items-center justify-center shrink-0">
            {org.logo_url ? (
              <img src={org.logo_url as string} alt={org.name as string} className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-6 h-6 text-primary/60" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold truncate">{org.name as string}</h2>
              <Badge variant="secondary" className="text-xs capitalize shrink-0">
                {ORG_TYPE_LABELS[org.type as string] ?? org.type as string}
              </Badge>
            </div>
            {(org.description as string | null) ? (
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                {org.description as string}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/40 mt-1 italic">
                Aucune description — modifiable dans les Paramètres.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Tab navigation ── */}
      <TooltipProvider delayDuration={200}>
        <div className="flex items-center gap-1 border-b border-border pb-0 -mx-1 px-1 overflow-x-auto overflow-x-auto scrollbar-none">
          {TABS.map(({ key, label, icon: Icon, path, settingKey, premium }) => {
            const href = `${base}/${path}`;
            const active = pathname.startsWith(`${base}/${path}`);
            const state = tabState(settingKey, key);

            if (state === 'hidden') return null;

            if (state === 'locked') {
              const isPremiumLocked = premium && settingKey && !orgSettings[settingKey];
              const tooltipMsg = isPremiumLocked
                ? 'Fonctionnalité payante — activez-la dans les Paramètres'
                : 'Rendu inaccessible par le propriétaire de l\'organisation';
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <Link
                      to={isAdmin ? `${base}/settings` : '#'}
                      className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 -mb-px border-transparent text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                      {premium ? (
                        <Crown className="w-3 h-3 ml-0.5 text-amber-400" />
                      ) : (
                        <Lock className="w-3 h-3 ml-0.5" />
                      )}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {tooltipMsg}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <Link
                key={key}
                to={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 -mb-px transition-colors',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
                {key === 'chat' && unreadCount > 0 && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
