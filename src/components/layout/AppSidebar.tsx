import { useState, Fragment } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users, Menu, X, LogOut, Settings, Shield, UserCircle, Eye, Sparkles, Building2, CalendarDays, CalendarCheck, Shirt, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Route, MapPinned, Gift, Search, Globe, Heart, MessageSquare, Info, Trophy, FileSpreadsheet, Newspaper, PenLine, Plus, Zap, Twitter, Star, Lock, GitCompareArrows, ArrowLeftRight, Home, BookUser, UserPlus, Crown, LayoutDashboard, ListChecks, BarChart2, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin, useIsPremium, useMyPermissions } from '@/hooks/use-admin';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useMyOrganizations, slugify } from '@/hooks/use-organization';
import { useOrgUnread } from '@/hooks/use-org-chat';
import { useAdminTicketUnreadCount, useMyTickets } from '@/hooks/use-tickets';
import { FeatureGate } from '@/components/FeatureGate';
import { usePageAccessInfo } from '@/hooks/use-page-access-info';
import logo from '@/assets/logo.png';

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

// ── Nav structure as data (rendered by renderTopItem / renderSubItem) ──
// Adding a link = adding an object here. pageKey gates it (RestrictedWrapper +
// canView), featureKey gates it (FeatureGate). Omit both for an ungated link.
interface NavLeaf {
  key: string;            // → t(`sidebar.${key}`)
  to: string;
  icon: LucideIcon;
  iconClass?: string;
  pageKey?: string;
  featureKey?: string;
  matchPaths?: string[];  // extra paths that also mark this item active
}
interface NavParent extends NavLeaf {
  children?: NavLeaf[];
}
interface NavSection {
  label: string;          // → t(`sidebar.${label}`)
  items: NavParent[];
}

const BASE_SECTIONS: NavSection[] = [
  {
    label: 'section_scouting',
    items: [
      {
        key: 'players', to: '/players', icon: Users, pageKey: 'players', featureKey: 'feature_players',
        children: [
          { key: 'discover', to: '/discover', icon: Search, pageKey: 'discover', featureKey: 'feature_discover' },
          { key: 'watchlist', to: '/watchlist', icon: Eye, pageKey: 'watchlist', featureKey: 'feature_watchlist' },
          { key: 'transfers', to: '/transfers', icon: ArrowLeftRight, pageKey: 'transfers', featureKey: 'feature_transfers' },
          { key: 'shadow_team', to: '/shadow-team', icon: Shirt, pageKey: 'shadow_team', featureKey: 'feature_shadow_team' },
          { key: 'compare', to: '/data', icon: GitCompareArrows, iconClass: 'text-violet-500' },
        ],
      },
      {
        key: 'fixtures', to: '/fixtures', icon: CalendarDays, pageKey: 'fixtures', featureKey: 'feature_fixtures',
        children: [
          { key: 'my_matches', to: '/my-matches', icon: MapPinned, pageKey: 'my_matches', featureKey: 'feature_my_matches' },
          { key: 'map', to: '/map', icon: Globe, pageKey: 'map', featureKey: 'feature_map' },
        ],
      },
    ],
  },
  {
    label: 'section_competitions',
    items: [
      {
        key: 'championships', to: '/championships', icon: Trophy, pageKey: 'championships', featureKey: 'feature_championships',
        children: [
          { key: 'my_championships',        to: '/my-championships',       icon: Star,        iconClass: 'text-yellow-500', pageKey: 'my_championships',        featureKey: 'feature_my_championships' },
          { key: 'championship_calendar',   to: '/championship-calendar',  icon: CalendarDays, pageKey: 'championships',    featureKey: 'feature_championships' },
        ],
      },
      {
        key: 'clubs', to: '/club-search', icon: Building2, matchPaths: ['/club'], pageKey: 'club_profile', featureKey: 'feature_club_profile',
        children: [
          { key: 'my_clubs',          to: '/my-clubs',          icon: Heart,    pageKey: 'my_clubs',          featureKey: 'feature_my_clubs' },
          { key: 'club_contacts',     to: '/club-contacts',     icon: BookUser, pageKey: 'club_contacts' },
          { key: 'club_recruitment',  to: '/club-recruitment',  icon: UserPlus, pageKey: 'club_recruitment' },
        ],
      },
    ],
  },
  {
    label: 'section_social',
    items: [
      {
        key: 'news', to: '/news', icon: Newspaper, pageKey: 'news', featureKey: 'feature_news',
        children: [
          { key: 'editorial', to: '/editorial', icon: PenLine, pageKey: 'editorial', featureKey: 'feature_editorial' },
        ],
      },
      { key: 'community', to: '/community', icon: MessageSquare, pageKey: 'community', featureKey: 'feature_community' },
    ],
  },
];

// Collapsed-mode flyout: hovering a parent icon reveals its children in a
// floating panel (CSS-only, the pl-2 bridges the gap so hover doesn't drop).
function CollapsedFlyout({
  label, trigger, children,
}: {
  label: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group/fly">
      {trigger}
      <div className="absolute left-full top-0 pl-2 z-50 opacity-0 pointer-events-none group-hover/fly:opacity-100 group-hover/fly:pointer-events-auto transition-opacity duration-150">
        <div className="min-w-[180px] rounded-xl bg-sidebar border border-sidebar-border shadow-xl p-1.5">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40 whitespace-nowrap">{label}</p>
          <div className="space-y-0.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Single contextual promo slot above the footer. One CTA at a time, never two:
// free users → Premium upsell, Premium users → Affiliation. Dismissible (persisted).
function SidebarPromo({
  collapsed, isPremium, canViewAffiliate, onNav,
}: {
  collapsed: boolean;
  isPremium: boolean;
  canViewAffiliate: boolean;
  onNav: () => void;
}) {
  const { t } = useTranslation();
  const variant: 'premium' | 'affiliate' | null =
    !isPremium ? 'premium' : (canViewAffiliate ? 'affiliate' : null);

  // Only the affiliation card can be dismissed. The Premium upsell stays put.
  const dismissible = variant === 'affiliate';
  const storageKey = 'scouty_promo_dismissed_affiliate';
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(storageKey) === 'true';
  });

  if (!variant || (dismissible && dismissed)) return null;

  const dismiss = () => {
    setDismissed(true);
    try { window.localStorage.setItem(storageKey, 'true'); } catch { /* ignore */ }
  };

  const cfg = variant === 'premium'
    ? {
        to: '/pricing', icon: Sparkles,
        title: t('sidebar.promo_premium_title'),
        desc: t('sidebar.promo_premium_desc'),
        cta: t('sidebar.promo_premium_cta'),
        cardCls: 'bg-gradient-to-br from-sidebar-primary to-accent text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/20',
        btnCls: 'bg-white/20 hover:bg-white/30 text-sidebar-primary-foreground',
      }
    : {
        to: '/affiliate', icon: Gift,
        title: t('sidebar.promo_affiliate_title'),
        desc: t('sidebar.promo_affiliate_desc'),
        cta: t('sidebar.promo_affiliate_cta'),
        cardCls: 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300',
        btnCls: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300',
      };
  const Icon = cfg.icon;

  // Collapsed: a single icon button (no card / no dismiss — too narrow)
  if (collapsed) {
    const mini = (
      <div className="px-2 pb-3">
        <SidebarTooltip label={cfg.title} collapsed={true}>
          <Link to={cfg.to} onClick={onNav} className={cn('flex items-center justify-center px-2 py-3 rounded-xl transition-all', cfg.cardCls)}>
            <Icon className="w-4 h-4" />
          </Link>
        </SidebarTooltip>
      </div>
    );
    return variant === 'affiliate'
      ? <FeatureGate featureKey="feature_affiliate" inline>{mini}</FeatureGate>
      : mini;
  }

  const card = (
    <div className="px-3 pb-3">
      <div className={cn('relative rounded-xl p-3', cfg.cardCls)}>
        {dismissible && (
          <button
            onClick={dismiss}
            aria-label={t('sidebar.promo_dismiss')}
            className="absolute top-1.5 right-1.5 p-0.5 rounded-md opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <div className={cn('flex items-center gap-2 mb-1', dismissible && 'pr-5')}>
          <Icon className="w-4 h-4 shrink-0" />
          <span className="text-sm font-bold">{cfg.title}</span>
        </div>
        <p className="text-[11px] opacity-80 leading-snug mb-2.5">{cfg.desc}</p>
        <Link to={cfg.to} onClick={onNav} className={cn('block text-center text-xs font-bold px-3 py-1.5 rounded-lg transition-colors', cfg.btnCls)}>
          {cfg.cta}
        </Link>
      </div>
    </div>
  );

  return variant === 'affiliate'
    ? <FeatureGate featureKey="feature_affiliate" inline>{card}</FeatureGate>
    : card;
}

function SidebarTooltip({
  label, collapsed, children, description,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
  description?: string;
}) {
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // In collapsed mode: simple right-side tooltip showing the label
  if (collapsed) {
    return (
      <div className="relative group/tip">
        {children}
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-sidebar-accent text-sidebar-accent-foreground text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
          {label}
          {description && <p className="text-[10px] opacity-70 mt-0.5 max-w-[160px] whitespace-normal">{description}</p>}
        </div>
      </div>
    );
  }

  // In expanded mode: if description is provided, show a mouse-following info tooltip
  if (description) {
    return (
      <div
        onMouseEnter={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
        onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setMousePos(null)}
      >
        {children}
        {mousePos && (
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{ left: mousePos.x + 14, top: mousePos.y - 10 }}
          >
            <div className="bg-popover border border-border rounded-xl shadow-xl p-2.5 min-w-[160px] max-w-[220px]">
              <p className="text-xs font-semibold text-popover-foreground mb-0.5">{label}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

function RestrictedWrapper({
  pageKey,
  canView,
  requiredRoles,
  children,
}: {
  pageKey: string;
  canView: boolean;
  requiredRoles: string[];
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  if (canView) return <>{children}</>;

  return (
    <div
      onMouseEnter={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setMousePos(null)}
    >
      {/* Grayed content — pointer-events-none so clicks are blocked */}
      <div className="opacity-40 pointer-events-none select-none">
        {children}
      </div>

      {/* Tooltip fixed to mouse position — outside sidebar overflow */}
      {mousePos && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: mousePos.x + 14, top: mousePos.y - 12 }}
        >
          <div className="bg-popover border border-border rounded-xl shadow-xl p-3 min-w-[160px] max-w-[220px]">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-5 h-5 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0">
                <Lock className="w-3 h-3 text-amber-500" />
              </div>
              <span className="text-xs font-bold text-popover-foreground">{t('sidebar.access_restricted')}</span>
            </div>
            {requiredRoles.length > 0 ? (
              <>
                <p className="text-[11px] text-muted-foreground mb-1.5">{t('sidebar.required_roles')}</p>
                <div className="flex flex-wrap gap-1">
                  {requiredRoles.map(role => (
                    <span key={role} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold capitalize">
                      {role}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t('sidebar.contact_admin_access')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const subLinkClass = (active: boolean) =>
  cn(
    'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
  );

const subLinkSmClass = (active: boolean) =>
  cn(
    'flex items-center gap-2.5 px-3 py-1 rounded-lg text-[12px] transition-all',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
  );

// Promoted org nav — top-level items for the active org in the "Organisation" tab
function OrgPromotedNav({
  orgBase,
  orgId,
  orgSettings,
  collapsed,
  isActive,
  linkClass,
  onNav,
}: {
  orgBase: string;
  orgId: string;
  orgSettings: Record<string, boolean | number>;
  collapsed: boolean;
  isActive: (path: string) => boolean;
  linkClass: (path: string, childPaths?: string[]) => string;
  onNav: () => void;
}) {
  const { t } = useTranslation();
  const { data: unreadData } = useOrgUnread(orgId);
  const unread = unreadData?.count ?? 0;

  // Sub-items use slightly smaller padding than top-level links
  const subClass = (path: string) =>
    cn(
      'flex items-center gap-2.5 rounded-lg text-xs font-medium transition-all duration-200',
      collapsed ? 'justify-center px-2 py-2' : 'px-3 py-1.5',
      isActive(path)
        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
        : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
    );

  const showDashboard = orgSettings.enable_dashboard !== false;
  const showShortlist = !!orgSettings.enable_shortlist;
  const showAnalytics = !!orgSettings.enable_analytics;

  return (
    <>
      {showDashboard && (
        <SidebarTooltip label="Tableau de bord" collapsed={collapsed}>
          <Link to={`${orgBase}/dashboard`} className={subClass(`${orgBase}/dashboard`)} onClick={onNav}>
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && 'Tableau de bord'}
          </Link>
        </SidebarTooltip>
      )}
      <SidebarTooltip label={t('sidebar.squad')} collapsed={collapsed}>
        <Link to={`${orgBase}/squad`} className={subClass(`${orgBase}/squad`)} onClick={onNav}>
          <ClipboardList className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && t('sidebar.squad')}
        </Link>
      </SidebarTooltip>
      <SidebarTooltip label={t('sidebar.org_players')} collapsed={collapsed}>
        <Link to={`${orgBase}/players`} className={subClass(`${orgBase}/players`)} onClick={onNav}>
          <Users className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && t('sidebar.org_players')}
        </Link>
      </SidebarTooltip>
      {showShortlist && (
        <SidebarTooltip label="Shortlist" collapsed={collapsed}>
          <Link to={`${orgBase}/shortlist`} className={subClass(`${orgBase}/shortlist`)} onClick={onNav}>
            <ListChecks className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && (
              <span className="flex items-center gap-1.5 flex-1">
                Shortlist
                <Crown className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              </span>
            )}
          </Link>
        </SidebarTooltip>
      )}
      <SidebarTooltip label={t('sidebar.roadmap')} collapsed={collapsed}>
        <Link to={`${orgBase}/roadmap`} className={subClass(`${orgBase}/roadmap`)} onClick={onNav}>
          <Route className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && t('sidebar.roadmap')}
        </Link>
      </SidebarTooltip>
      <SidebarTooltip label={t('sidebar.org_chat')} collapsed={collapsed}>
        <Link to={`${orgBase}/chat`} className={subClass(`${orgBase}/chat`)} onClick={onNav}>
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && (
            <span className="flex items-center gap-2 flex-1">
              {t('sidebar.org_chat')}
              {unread > 0 && (
                <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </span>
          )}
        </Link>
      </SidebarTooltip>
      {showAnalytics && (
        <SidebarTooltip label="Analytics" collapsed={collapsed}>
          <Link to={`${orgBase}/analytics`} className={subClass(`${orgBase}/analytics`)} onClick={onNav}>
            <BarChart2 className="w-3.5 h-3.5 shrink-0" />
            {!collapsed && (
              <span className="flex items-center gap-1.5 flex-1">
                Analytics
                <Crown className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              </span>
            )}
          </Link>
        </SidebarTooltip>
      )}
      <SidebarTooltip label={t('sidebar.org_settings')} collapsed={collapsed}>
        <Link to={`${orgBase}/settings`} className={subClass(`${orgBase}/settings`)} onClick={onNav}>
          <Settings className="w-3.5 h-3.5 shrink-0" />
          {!collapsed && t('sidebar.org_settings')}
        </Link>
      </SidebarTooltip>
    </>
  );
}

export default function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { data: isPremium } = useIsPremium();
  const { data: permsData } = useMyPermissions();
  const { data: ticketUnread = 0 } = useAdminTicketUnreadCount();
  const { data: myTicketsList = [] } = useMyTickets();
  const myTicketUnread = myTicketsList.reduce((sum, tk) => sum + (tk.unread_count ?? 0), 0);
  const { data: myOrgs } = useMyOrganizations();
  const { t } = useTranslation();
  const { hideRestrictedElements } = useUiPreferences();
  const { data: pageAccessInfo } = usePageAccessInfo();

  // Tab switcher: derive active tab from URL — org-related routes activate the "Organisation" tab
  const isOrgTab = location.pathname.startsWith('/organization');
  const activeOrgSlug = location.pathname.match(/^\/organization\/([^/?]+)/)?.[1];
  const activeOrg = myOrgs?.find(o => slugify(o.name) === activeOrgSlug);

  const WHITELIST_ONLY = new Set(['admin', 'data_import', 'editorial']);
  const canView = (pageKey: string): boolean => {
    if (isAdmin) return true;
    if (!permsData?.permissions) return !WHITELIST_ONLY.has(pageKey);
    const val = permsData.permissions[pageKey];
    if (val === undefined) return !WHITELIST_ONLY.has(pageKey);
    return val;
  };

  const canAction = (pageKey: string, action: string): boolean => {
    if (isAdmin) return true;
    const val = (permsData?.permissions as Record<string, unknown> | undefined)?.[pageKey];
    if (val && typeof val === 'object') return !!(val as Record<string, boolean>)[action];
    return false;
  };

  // When hideRestrictedElements is off, restricted items are greyed out instead of hidden
  const shouldShow = (pageKey: string) => canView(pageKey) || !hideRestrictedElements;
  const restrictedClass = (pageKey: string) => (!canView(pageKey) ? 'pointer-events-none opacity-40' : '');

  const [mobileOpen, setMobileOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [footerMenuOpen, setFooterMenuOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem('scouty_footer_menu_open');
    return stored === null ? false : stored === 'true';
  });
  const toggleFooterMenu = () => {
    setFooterMenuOpen(prev => {
      const next = !prev;
      try { window.localStorage.setItem('scouty_footer_menu_open', String(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Per-parent open state, keyed by item.key. undefined = auto (follows the active child route).
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({});

  const hasActiveChild = (paths: string[]) =>
    paths.some(p => location.pathname === p || location.pathname.startsWith(p + '/') || location.pathname.startsWith(p + '?'));

  const childPathsOf = (item: NavParent) => (item.children ?? []).map(c => c.to);
  const isOpen = (item: NavParent) => openOverrides[item.key] ?? hasActiveChild(childPathsOf(item));
  const toggleOpen = (item: NavParent) =>
    setOpenOverrides(prev => ({ ...prev, [item.key]: !(prev[item.key] ?? hasActiveChild(childPathsOf(item))) }));

  // Per-section open state (null = auto, follows active child route; true/false = user override)
  const [playersOpenOverride, setPlayersOpenOverride] = useState<boolean | null>(null);
  const [fixturesOpenOverride, setFixturesOpenOverride] = useState<boolean | null>(null);
  const [champOpenOverride, setChampOpenOverride] = useState<boolean | null>(null);

  const playersChildPaths = ['/discover', '/watchlist', '/transfers', '/shadow-team'];
  const fixturesChildPaths = ['/my-matches', '/map', '/saved-match', '/match-library'];
  const champChildPaths = ['/my-championships', '/my-clubs', '/club', '/club-search'];

  const playersOpen = playersOpenOverride ?? hasActiveChild(playersChildPaths);
  const fixturesOpen = fixturesOpenOverride ?? hasActiveChild(fixturesChildPaths);
  const champOpen = champOpenOverride ?? hasActiveChild(champChildPaths);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleTabSwitch = (tab: 'base' | 'org') => {
    setMobileOpen(false);
    if (tab === 'base' && isOrgTab) {
      navigate('/players');
    } else if (tab === 'org' && !isOrgTab) {
      if (myOrgs && myOrgs.length > 0) {
        navigate(`/organization/${slugify(myOrgs[0].name)}/squad`);
      } else {
        navigate('/organization');
      }
    }
  };

  const isActive = (path: string) => {
    if (path.includes('?')) return location.pathname + location.search === path;
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
  };

  const isParentActive = (path: string, childPaths: string[]) =>
    isActive(path) && !childPaths.some(cp => isActive(cp));

  const linkClass = (path: string, childPaths?: string[]) =>
    cn(
      'flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200',
      collapsed ? 'justify-center px-2 py-2' : 'px-4 py-2',
      (childPaths ? isParentActive(path, childPaths) : isActive(path))
        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
    );

  const footerLinkClass = (path: string) =>
    cn(
      'flex items-center gap-3 rounded-lg text-xs transition-all',
      collapsed ? 'justify-center px-2 py-1.5' : 'px-3 py-1.5',
      isActive(path)
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
    );

  const footerBtnClass = cn(
    'flex items-center gap-3 rounded-lg text-xs w-full text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all',
    collapsed ? 'justify-center px-2 py-1.5' : 'px-3 py-1.5'
  );

  // Wraps a parent nav item row with an expand/collapse chevron
  function CollapsibleParent({
    open,
    onToggleOpen,
    children,
  }: {
    open: boolean;
    onToggleOpen: () => void;
    children: React.ReactNode;
  }) {
    if (collapsed) return <>{children}</>;
    return (
      <div className="flex items-center group/parent">
        <div className="flex-1 min-w-0">{children}</div>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleOpen(); }}
          className="shrink-0 ml-0.5 p-1 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
          aria-label={open ? 'Réduire' : 'Développer'}
        >
          <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </div>
    );
  }

  // ── Data-driven nav rendering ──
  const itemIsActive = (it: NavLeaf) => [it.to, ...(it.matchPaths ?? [])].some(isActive);
  const itemVisible = (it: NavLeaf) => !it.pageKey || shouldShow(it.pageKey);

  // Wrap a node with the gates declared in its config (skipped when absent).
  const withGates = (it: NavLeaf, node: React.ReactNode): React.ReactNode => {
    let el = node;
    if (it.featureKey) el = <FeatureGate featureKey={it.featureKey} inline>{el}</FeatureGate>;
    if (it.pageKey) {
      el = (
        <RestrictedWrapper pageKey={it.pageKey} canView={canView(it.pageKey)} requiredRoles={pageAccessInfo?.[it.pageKey] ?? []}>
          {el}
        </RestrictedWrapper>
      );
    }
    return el;
  };

  const topClass = (item: NavParent, hasKids: boolean) => {
    const selfActive = itemIsActive(item);
    const active = hasKids ? selfActive && !(item.children ?? []).some(itemIsActive) : selfActive;
    return cn(
      'flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200',
      collapsed ? 'justify-center px-2 py-2' : 'px-4 py-2',
      active
        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
        : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
    );
  };

  const renderSubItem = (sub: NavLeaf) => {
    if (!itemVisible(sub)) return null;
    const Icon = sub.icon;
    const active = itemIsActive(sub);
    const link = (
      <Link
        to={sub.to}
        className={subLinkClass(active)}
        aria-current={active ? 'page' : undefined}
        onClick={() => setMobileOpen(false)}
      >
        <Icon className={cn('w-3.5 h-3.5 shrink-0', sub.iconClass)} />
        {t(`sidebar.${sub.key}`)}
      </Link>
    );
    return <Fragment key={sub.key}>{withGates(sub, link)}</Fragment>;
  };

  const renderTopItem = (item: NavParent) => {
    if (!itemVisible(item)) return null;
    const Icon = item.icon;
    const hasKids = !!item.children?.length;
    const label = t(`sidebar.${item.key}`);
    const active = itemIsActive(item);

    const link = (
      <Link
        to={item.to}
        className={topClass(item, hasKids)}
        aria-current={active ? 'page' : undefined}
        onClick={() => { setMobileOpen(false); if (hasKids) setOpenOverrides(prev => ({ ...prev, [item.key]: true })); }}
      >
        <Icon className={cn('w-4 h-4 shrink-0', item.iconClass)} />
        {!collapsed && label}
      </Link>
    );

    let row: React.ReactNode;
    if (collapsed) {
      row = hasKids
        ? <CollapsedFlyout label={label} trigger={link}>{item.children!.map(renderSubItem)}</CollapsedFlyout>
        : <SidebarTooltip label={label} collapsed={true}>{link}</SidebarTooltip>;
    } else {
      row = hasKids
        ? <CollapsibleParent open={isOpen(item)} onToggleOpen={() => toggleOpen(item)}>{link}</CollapsibleParent>
        : link;
    }

    return (
      <Fragment key={item.key}>
        {withGates(item, row)}
        {!collapsed && hasKids && isOpen(item) && (!item.pageKey || canView(item.pageKey)) && (
          <div className="pl-7 space-y-0.5">
            {item.children!.map(renderSubItem)}
          </div>
        )}
      </Fragment>
    );
  };

  const sidebar = (
    <div className="flex flex-col h-full" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Logo + collapse toggle */}
      {collapsed ? (
        <div className="py-4 flex flex-col items-center gap-2 px-2">
          <button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <img src={logo} alt="Scouty" className="w-6 h-6 rounded-xl shrink-0" />
        </div>
      ) : (
        <div className="py-4 flex items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Scouty" className="w-10 h-10 rounded-xl shrink-0" />
            <div>
              <span className="text-lg font-extrabold text-sidebar-foreground tracking-tight">Scouty</span>
              <p className="text-[10px] text-sidebar-muted font-medium tracking-widest uppercase">Football Scouting</p>
            </div>
          </div>
          <button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className={cn('flex-1 space-y-0.5', collapsed ? 'px-2 overflow-visible' : 'px-3 overflow-y-auto sidebar-scroll')}>

        {/* ── Tab switcher (Ma base / Organisation) ── */}
        {shouldShow('organization') && (collapsed ? (
          <div className="pb-2 flex flex-col gap-1">
            <SidebarTooltip label={t('sidebar.tab_base')} collapsed={true}>
              <button
                onClick={() => handleTabSwitch('base')}
                className={cn(
                  'flex items-center justify-center w-full p-2 rounded-lg transition-all',
                  !isOrgTab
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                )}
                aria-label={t('sidebar.tab_base')}
              >
                <Home className="w-4 h-4" />
              </button>
            </SidebarTooltip>
            <SidebarTooltip label={t('sidebar.organization')} collapsed={true}>
              <button
                onClick={() => canView('organization') && handleTabSwitch('org')}
                disabled={!canView('organization')}
                className={cn(
                  'flex items-center justify-center w-full p-2 rounded-lg transition-all',
                  isOrgTab
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                  !canView('organization') && 'opacity-40 cursor-not-allowed'
                )}
                aria-label={t('sidebar.organization')}
              >
                <Building2 className="w-4 h-4" />
              </button>
            </SidebarTooltip>
          </div>
        ) : (
          <div className="pt-1 pb-2">
            <div className="flex bg-sidebar-accent/30 rounded-xl p-1 gap-1">
              <button
                onClick={() => handleTabSwitch('base')}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  !isOrgTab
                    ? 'bg-sidebar text-sidebar-foreground shadow-sm'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
                )}
              >
                {t('sidebar.tab_base')}
              </button>
              <button
                onClick={() => canView('organization') && handleTabSwitch('org')}
                disabled={!canView('organization')}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  isOrgTab
                    ? 'bg-sidebar text-sidebar-foreground shadow-sm'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground',
                  !canView('organization') && 'opacity-40 cursor-not-allowed'
                )}
              >
                {t('sidebar.organization')}
              </button>
            </div>
          </div>
        ))}

        {/* ── Base tab content ── */}
        {!isOrgTab && BASE_SECTIONS.map((section) => {
          const items = section.items.filter(itemVisible);
          if (items.length === 0) return null;
          return (
            <div key={section.label} className="pt-2 space-y-0.5">
              {!collapsed && (
                <p className="px-4 pb-1 text-[10px] uppercase tracking-wider font-bold text-sidebar-foreground/40">
                  {t(`sidebar.${section.label}`)}
                </p>
              )}
              {items.map(renderTopItem)}
            </div>
          );
        })}

        {/* ── Organisation tab content ── */}
        {isOrgTab && (
          <>
            {(!myOrgs || myOrgs.length === 0) ? (
              <div className={cn('text-center', collapsed ? 'px-1 py-4' : 'px-4 py-8')}>
                <Building2 className={cn('mx-auto mb-3 text-sidebar-foreground/30', collapsed ? 'w-5 h-5' : 'w-10 h-10')} />
                {!collapsed && (
                  <>
                    <p className="text-xs text-sidebar-foreground/60 mb-4 leading-relaxed">
                      {t('sidebar.org_empty')}
                    </p>
                    <Link
                      to="/organization"
                      className="inline-block w-full px-3 py-2 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
                      onClick={() => setMobileOpen(false)}
                    >
                      {t('sidebar.org_create_or_join')}
                    </Link>
                    <Link
                      to="/organization/discover"
                      className="inline-flex items-center justify-center gap-1.5 w-full mt-2 px-3 py-2 rounded-lg border border-sidebar-border text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all"
                      onClick={() => setMobileOpen(false)}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      Découvrir des organisations
                    </Link>
                  </>
                )}
                {collapsed && (
                  <SidebarTooltip label="Découvrir des organisations" collapsed={collapsed}>
                    <Link
                      to="/organization/discover"
                      className="flex items-center justify-center px-2 py-2 rounded-xl text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all"
                      onClick={() => setMobileOpen(false)}
                    >
                      <Globe className="w-4 h-4" />
                    </Link>
                  </SidebarTooltip>
                )}
              </div>
            ) : (
              <>
                {!collapsed && (
                  <div className="px-4 pt-1 pb-1.5">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-sidebar-foreground/40">
                      {t('sidebar.my_orgs')}
                    </p>
                  </div>
                )}
                {myOrgs.map((org) => {
                  const slug = slugify(org.name);
                  const orgBase = `/organization/${slug}`;
                  const isThisOrgActive = slug === activeOrgSlug;
                  const orgSettings = (() => {
                    try {
                      const raw = (org as any).settings;
                      if (!raw) return {};
                      return typeof raw === 'string' ? JSON.parse(raw) : raw;
                    } catch { return {}; }
                  })();
                  return (
                    <Fragment key={org.id}>
                      <SidebarTooltip label={org.name} collapsed={collapsed}>
                        <Link
                          to={`${orgBase}/squad`}
                          className={cn(
                            'flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200',
                            collapsed ? 'justify-center px-2 py-2' : 'px-4 py-2',
                            isThisOrgActive
                              ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                              : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                          )}
                          onClick={() => setMobileOpen(false)}
                        >
                          <div className={cn('rounded overflow-hidden flex items-center justify-center shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')}>
                            {org.logo_url ? (
                              <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
                            ) : (
                              <Building2 className="w-full h-full" />
                            )}
                          </div>
                          {!collapsed && <span className="truncate">{org.name}</span>}
                        </Link>
                      </SidebarTooltip>

                      {/* Sub-menu: rendered immediately below its org, only when active */}
                      {isThisOrgActive && (
                        <div className={cn(
                          collapsed ? 'mt-0.5 mb-1' : 'mt-0.5 mb-1 ml-3 pl-3 border-l border-sidebar-border/40'
                        )}>
                          <OrgPromotedNav
                            orgBase={orgBase}
                            orgId={org.id as string}
                            orgSettings={orgSettings}
                            collapsed={collapsed}
                            isActive={isActive}
                            linkClass={linkClass}
                            onNav={() => setMobileOpen(false)}
                          />
                        </div>
                      )}
                    </Fragment>
                  );
                })}

                {/* Découvrir des organisations publiques */}
                {!collapsed && <div className="mx-3 mt-2 border-t border-sidebar-border/40" />}
                <SidebarTooltip label="Découvrir des organisations" collapsed={collapsed}>
                  <Link
                    to="/organization/discover"
                    className={cn(
                      'flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 mt-1',
                      collapsed ? 'justify-center px-2 py-2' : 'px-4 py-2',
                      isActive('/organization/discover')
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                        : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                    )}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Globe className="w-4 h-4 shrink-0" />
                    {!collapsed && <span>Découvrir</span>}
                  </Link>
                </SidebarTooltip>
              </>
            )}
          </>
        )}
      </nav>

      {/* Encart promo contextuel : Premium (gratuits) ou Affiliation (Premium), masquable */}
      <SidebarPromo
        collapsed={collapsed}
        isPremium={!!isPremium}
        canViewAffiliate={canView('affiliate')}
        onNav={() => setMobileOpen(false)}
      />

      {/* Footer */}
      <div className={cn('py-3 border-t border-sidebar-border shrink-0', collapsed ? 'px-2' : 'px-3')}>
        {/* Toggle for the collapsible footer menu */}
        <button
          onClick={toggleFooterMenu}
          className={cn(
            'flex items-center gap-1.5 text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors w-full mb-1.5',
            collapsed ? 'justify-center' : ''
          )}
          aria-label={t('sidebar.more')}
          aria-expanded={footerMenuOpen}
        >
          {!collapsed && <span className="uppercase tracking-wider font-bold">{t('sidebar.more')}</span>}
          <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', !collapsed && 'ml-auto', footerMenuOpen && 'rotate-180')} />
        </button>

        {/* Collapsible footer menu */}
        {footerMenuOpen && (
          <div className="space-y-0.5">
            {isAdmin && (
              <SidebarTooltip label={t('sidebar.administration')} collapsed={collapsed} description={t('sidebar.tooltip_admin')}>
                <Link to="/admin" className={footerLinkClass('/admin')} onClick={() => setMobileOpen(false)}>
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  {!collapsed && t('sidebar.administration')}
                </Link>
              </SidebarTooltip>
            )}
            {isAdmin && (
              <SidebarTooltip label={t('sidebar.tickets')} collapsed={collapsed} description={t('sidebar.tooltip_admin_tickets')}>
                <Link to="/admin/tickets" className={footerLinkClass('/admin/tickets')} onClick={() => setMobileOpen(false)}>
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  {!collapsed && t('sidebar.tickets')}
                  {ticketUnread > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[9px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                      {ticketUnread}
                    </span>
                  )}
                </Link>
              </SidebarTooltip>
            )}

            <SidebarTooltip label={t('sidebar.my_account')} collapsed={collapsed} description={t('sidebar.tooltip_account')}>
              <Link to="/account" className={footerLinkClass('/account')} onClick={() => setMobileOpen(false)}>
                <UserCircle className="w-3.5 h-3.5 shrink-0" />
                {!collapsed && t('sidebar.my_account')}
              </Link>
            </SidebarTooltip>

            {shouldShow('settings') && (
              <RestrictedWrapper pageKey="settings" canView={canView('settings')} requiredRoles={pageAccessInfo?.['settings'] ?? []}>
                <SidebarTooltip label={t('sidebar.settings')} collapsed={collapsed} description={t('sidebar.tooltip_settings')}>
                  <Link to="/settings" className={footerLinkClass('/settings')} onClick={() => setMobileOpen(false)}>
                    <Settings className="w-3.5 h-3.5 shrink-0" />
                    {!collapsed && t('sidebar.settings')}
                  </Link>
                </SidebarTooltip>
              </RestrictedWrapper>
            )}

            {/* ── Import de données — réservé aux rôles admin & importateur ── */}
            {(isAdmin || (permsData?.roles ?? []).includes('importateur')) && (
              <FeatureGate featureKey="feature_data_import" inline>
                <SidebarTooltip label={t('sidebar.data_import')} collapsed={collapsed}>
                  <Link to="/data-import" className={footerLinkClass('/data-import')} onClick={() => setMobileOpen(false)}>
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    {!collapsed && t('sidebar.data_import')}
                  </Link>
                </SidebarTooltip>
              </FeatureGate>
            )}

            {shouldShow('booking') && (
              <RestrictedWrapper pageKey="booking" canView={canView('booking')} requiredRoles={pageAccessInfo?.['booking'] ?? []}>
                <FeatureGate featureKey="feature_booking" inline>
                  <SidebarTooltip label={t('sidebar.booking')} collapsed={collapsed}>
                    <Link to="/booking" className={footerLinkClass('/booking')} onClick={() => setMobileOpen(false)}>
                      <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                      {!collapsed && t('sidebar.booking')}
                    </Link>
                  </SidebarTooltip>
                </FeatureGate>
              </RestrictedWrapper>
            )}

            {shouldShow('affiliate') && (
              <RestrictedWrapper pageKey="affiliate" canView={canView('affiliate')} requiredRoles={pageAccessInfo?.['affiliate'] ?? []}>
                <FeatureGate featureKey="feature_affiliate" inline>
                  <SidebarTooltip label={t('sidebar.affiliate')} collapsed={collapsed}>
                    <Link to="/affiliate" className={footerLinkClass('/affiliate')} onClick={() => setMobileOpen(false)}>
                      <Gift className="w-3.5 h-3.5 shrink-0" />
                      {!collapsed && t('sidebar.affiliate')}
                    </Link>
                  </SidebarTooltip>
                </FeatureGate>
              </RestrictedWrapper>
            )}

            {shouldShow('my_tickets') && (
              <RestrictedWrapper pageKey="my_tickets" canView={canView('my_tickets')} requiredRoles={pageAccessInfo?.['my_tickets'] ?? []}>
                <FeatureGate featureKey="feature_my_tickets" inline>
                  <SidebarTooltip label={t('sidebar.my_tickets')} collapsed={collapsed} description={t('sidebar.tooltip_my_tickets')}>
                    <Link to="/my-tickets" className={footerLinkClass('/my-tickets')} onClick={() => setMobileOpen(false)}>
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      {!collapsed && t('sidebar.my_tickets')}
                      {myTicketUnread > 0 && (
                        <span className="ml-auto bg-primary text-primary-foreground text-[9px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-bold px-1">
                          {myTicketUnread}
                        </span>
                      )}
                    </Link>
                  </SidebarTooltip>
                </FeatureGate>
              </RestrictedWrapper>
            )}

            <SidebarTooltip label={t('sidebar.signout')} collapsed={collapsed} description={t('sidebar.tooltip_signout')}>
              <button onClick={handleSignOut} className={footerBtnClass}>
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                {!collapsed && t('sidebar.signout')}
              </button>
            </SidebarTooltip>
          </div>
        )}

        {!collapsed && (
          <div className="mt-3 px-3">
            <button
              onClick={() => setLegalOpen(prev => !prev)}
              className="flex items-center gap-1.5 text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors w-full"
            >
              <Info className="w-3 h-3 shrink-0" />
              {t('footer.info')}
              <ChevronDown className={cn('w-3 h-3 ml-auto transition-transform duration-200', legalOpen && 'rotate-180')} />
            </button>
            {legalOpen && (
              <div className="mt-1 pl-4 space-y-0.5">
                <Link to="/legal" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.legal')}
                </Link>
                <Link to="/cgv" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.cgv')}
                </Link>
                <Link to="/cgu" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.cgu')}
                </Link>
                <Link to="/about" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.about')}
                </Link>
                <Link to="/privacy" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.privacy')}
                </Link>
                <Link to="/cookies" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.cookies')}
                </Link>
                <Link to="/accessibility" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.accessibility')}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed z-50 p-2 rounded-xl bg-card shadow-md border border-border"
        style={{ top: 'calc(env(safe-area-inset-top) + 1rem)', left: 'calc(env(safe-area-inset-left) + 1rem)' }}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-foreground/40 backdrop-blur-sm z-40" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-screen bg-sidebar z-40 transition-all duration-300',
          collapsed ? 'w-[72px]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {sidebar}
      </aside>
    </>
  );
}
