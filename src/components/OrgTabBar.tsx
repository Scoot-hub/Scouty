import { Link, useLocation } from 'react-router-dom';
import { Users, UserSquare2, Map, Settings, Building2, MessageSquare, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { slugify, useCurrentOrg } from '@/hooks/use-organization';
import { Badge } from '@/components/ui/badge';
import { useOrgUnread } from '@/hooks/use-org-chat';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OrgTabBarProps {
  orgName: string;
}

const TABS = [
  { key: 'squad',    label: 'Effectif',                   icon: Users,          path: 'squad'    },
  { key: 'players',  label: "Joueurs de l'organisation",  icon: UserSquare2,    path: 'players'  },
  { key: 'roadmap',  label: 'Feuille de route',           icon: Map,            path: 'roadmap'  },
  { key: 'chat',     label: 'Discussion',                  icon: MessageSquare,  path: 'chat'     },
  { key: 'settings', label: 'Paramètres',                 icon: Settings,       path: 'settings' },
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
  const squadBlocked = orgSettings.allow_squad_viewing === false && !isAdmin;

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
        <div className="flex items-center gap-1 border-b border-border pb-0 -mx-1 px-1 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon, path }) => {
            const href = `${base}/${path}`;
            const active = pathname.startsWith(`${base}/${path}`);
            const blocked = key === 'squad' && squadBlocked;

            if (blocked) {
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <span
                      className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 -mb-px border-transparent text-muted-foreground/40 cursor-not-allowed select-none"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                      <Lock className="w-3 h-3 ml-0.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Rendu inaccessible par le propriétaire de l'organisation
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
