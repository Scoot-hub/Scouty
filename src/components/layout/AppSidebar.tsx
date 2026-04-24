import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users, Menu, X, LogOut, Settings, Shield, UserCircle, Eye, Sparkles, Building2, Bug, CalendarDays, CalendarCheck, Shirt, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Route, MapPinned, Gift, Search, Globe, Heart, MessageSquare, Info, Trophy, FileSpreadsheet
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin, useIsPremium, useMyPermissions } from '@/hooks/use-admin';
import { useMyOrganizations, slugify } from '@/hooks/use-organization';
import { useAdminTicketUnreadCount } from '@/hooks/use-tickets';
import ReportIssueDialog from '@/components/ReportIssueDialog';
import { FeatureGate } from '@/components/FeatureGate';
import logo from '@/assets/logo.png';

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

function SidebarTooltip({ label, collapsed, children }: { label: string; collapsed: boolean; children: React.ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-lg bg-sidebar-accent text-sidebar-accent-foreground text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
        {label}
      </div>
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

export default function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { data: isPremium } = useIsPremium();
  const { data: permsData } = useMyPermissions();
  const { data: ticketUnread = 0 } = useAdminTicketUnreadCount();
  const { data: myOrgs } = useMyOrganizations();
  const { t } = useTranslation();

  const WHITELIST_ONLY = new Set(['admin', 'data_import']);
  const canView = (pageKey: string): boolean => {
    if (isAdmin) return true;
    if (!permsData?.permissions) return !WHITELIST_ONLY.has(pageKey);
    const val = permsData.permissions[pageKey];
    if (val === undefined) return !WHITELIST_ONLY.has(pageKey);
    return val;
  };

  const [mobileOpen, setMobileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);

  // null = auto (based on active child route), true/false = user override
  const [playersOpenOverride, setPlayersOpenOverride] = useState<boolean | null>(null);
  const [fixturesOpenOverride, setFixturesOpenOverride] = useState<boolean | null>(null);
  const [orgOpenOverride, setOrgOpenOverride] = useState<boolean | null>(null);

  const hasActiveChild = (paths: string[]) =>
    paths.some(p => location.pathname === p || location.pathname.startsWith(p + '/') || location.pathname.startsWith(p + '?'));

  const playersChildPaths = ['/discover', '/watchlist', '/shadow-team'];
  const fixturesChildPaths = ['/my-matches', '/map'];
  const clubChildPaths = ['/my-clubs'];
  const orgChildPaths = myOrgs?.map(o => `/organization/${slugify(o.name)}`) ?? [];

  const [clubOpenOverride, setClubOpenOverride] = useState<boolean | null>(null);

  const playersOpen = playersOpenOverride ?? hasActiveChild(playersChildPaths);
  const fixturesOpen = fixturesOpenOverride ?? hasActiveChild(fixturesChildPaths);
  const orgOpen = orgOpenOverride ?? hasActiveChild(orgChildPaths);
  const clubOpen = clubOpenOverride ?? hasActiveChild(clubChildPaths);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
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

  const sidebar = (
    <div className="flex flex-col h-full">
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
      <nav className={cn('flex-1 space-y-0.5', collapsed ? 'px-2 overflow-hidden' : 'px-3 overflow-y-auto sidebar-scroll')}>

        {/* ── Joueurs ── */}
        {canView('players') && (
          <CollapsibleParent open={playersOpen} onToggleOpen={() => setPlayersOpenOverride(v => v === null ? !hasActiveChild(playersChildPaths) : !v)}>
            <SidebarTooltip label={t('sidebar.players')} collapsed={collapsed}>
              <Link to="/players" className={linkClass('/players', playersChildPaths)} onClick={() => { setMobileOpen(false); setPlayersOpenOverride(true); }}>
                <Users className="w-4 h-4 shrink-0" />
                {!collapsed && t('sidebar.players')}
              </Link>
            </SidebarTooltip>
          </CollapsibleParent>
        )}

        {!collapsed && canView('players') && playersOpen && (
          <div className="pl-7 space-y-0.5">
            {canView('discover') && (
              <FeatureGate featureKey="feature_discover" inline>
                <Link to="/discover" className={subLinkClass(isActive('/discover'))} onClick={() => setMobileOpen(false)}>
                  <Search className="w-3.5 h-3.5" />
                  <span className="flex items-center gap-2">
                    {t('sidebar.discover')}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">PRO</span>
                  </span>
                </Link>
              </FeatureGate>
            )}
            {canView('watchlist') && (
              <Link to="/watchlist" className={subLinkClass(isActive('/watchlist'))} onClick={() => setMobileOpen(false)}>
                <Eye className="w-3.5 h-3.5" />
                {t('sidebar.watchlist')}
              </Link>
            )}
            {canView('shadow_team') && (
              <FeatureGate featureKey="feature_shadow_team" inline>
                <Link to="/shadow-team" className={subLinkClass(isActive('/shadow-team'))} onClick={() => setMobileOpen(false)}>
                  <Shirt className="w-3.5 h-3.5" />
                  {t('sidebar.shadow_team')}
                </Link>
              </FeatureGate>
            )}
          </div>
        )}

        {/* ── Organisation ── */}
        {canView('organization') && (
          <CollapsibleParent open={orgOpen} onToggleOpen={() => setOrgOpenOverride(v => v === null ? !hasActiveChild(orgChildPaths) : !v)}>
            <SidebarTooltip label={t('sidebar.organization')} collapsed={collapsed}>
              <Link to="/organization" className={linkClass('/organization', orgChildPaths)} onClick={() => { setMobileOpen(false); setOrgOpenOverride(true); }}>
                <Building2 className="w-4 h-4 shrink-0" />
                {!collapsed && t('sidebar.organization')}
              </Link>
            </SidebarTooltip>
          </CollapsibleParent>
        )}

        {!collapsed && canView('organization') && orgOpen && myOrgs && myOrgs.length > 0 && (
          <div className="pl-7 space-y-0.5">
            {myOrgs.map((org) => {
              const slug = slugify(org.name);
              const orgBase = `/organization/${slug}`;
              const isOrgActive = location.pathname === orgBase || location.pathname.startsWith(orgBase + '/');
              return (
                <div key={org.id}>
                  <Link
                    to={orgBase}
                    className={subLinkClass(isOrgActive)}
                    onClick={() => setMobileOpen(false)}
                  >
                    <div className="w-3.5 h-3.5 rounded overflow-hidden flex items-center justify-center shrink-0">
                      {org.logo_url ? (
                        <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span className="truncate">{org.name}</span>
                  </Link>
                  {isOrgActive && (
                    <div className="pl-6 space-y-0.5 mt-0.5">
                      <Link to={`${orgBase}/squad`} className={subLinkSmClass(isActive(`${orgBase}/squad`))} onClick={() => setMobileOpen(false)}>
                        <ClipboardList className="w-3 h-3" />
                        {t('sidebar.squad')}
                      </Link>
                      <Link to={`${orgBase}/players`} className={subLinkSmClass(isActive(`${orgBase}/players`))} onClick={() => setMobileOpen(false)}>
                        <Users className="w-3 h-3" />
                        {t('sidebar.org_players')}
                      </Link>
                      <Link to={`${orgBase}/roadmap`} className={subLinkSmClass(isActive(`${orgBase}/roadmap`))} onClick={() => setMobileOpen(false)}>
                        <Route className="w-3 h-3" />
                        {t('sidebar.roadmap')}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Calendrier / Fixtures ── */}
        {canView('fixtures') && (
          <FeatureGate featureKey="feature_fixtures" inline>
            <CollapsibleParent open={fixturesOpen} onToggleOpen={() => setFixturesOpenOverride(v => v === null ? !hasActiveChild(fixturesChildPaths) : !v)}>
              <SidebarTooltip label={t('sidebar.fixtures')} collapsed={collapsed}>
                <Link to="/fixtures" className={linkClass('/fixtures', fixturesChildPaths)} onClick={() => { setMobileOpen(false); setFixturesOpenOverride(true); }}>
                  <CalendarDays className="w-4 h-4 shrink-0" />
                  {!collapsed && t('sidebar.fixtures')}
                </Link>
              </SidebarTooltip>
            </CollapsibleParent>
          </FeatureGate>
        )}

        {!collapsed && canView('fixtures') && fixturesOpen && (
          <div className="pl-7 space-y-0.5">
            {canView('my_matches') && (
              <Link to="/my-matches" className={subLinkClass(isActive('/my-matches'))} onClick={() => setMobileOpen(false)}>
                <MapPinned className="w-3.5 h-3.5" />
                {t('sidebar.my_matches')}
              </Link>
            )}
            {canView('map') && (
              <FeatureGate featureKey="feature_map" inline>
                <Link to="/map" className={subLinkClass(isActive('/map'))} onClick={() => setMobileOpen(false)}>
                  <Globe className="w-3.5 h-3.5" />
                  {t('sidebar.map')}
                </Link>
              </FeatureGate>
            )}
          </div>
        )}

        {/* ── Championnats ── */}
        <SidebarTooltip label={t('sidebar.championships')} collapsed={collapsed}>
          <Link to="/championships" className={linkClass('/championships')} onClick={() => setMobileOpen(false)}>
            <Trophy className="w-4 h-4 shrink-0" />
            {!collapsed && t('sidebar.championships')}
          </Link>
        </SidebarTooltip>

        {/* ── Fiche club ── */}
        {canView('club_profile') && (
          <FeatureGate featureKey="feature_club_profile" inline>
            <CollapsibleParent open={clubOpen} onToggleOpen={() => setClubOpenOverride(v => v === null ? !hasActiveChild(clubChildPaths) : !v)}>
              <SidebarTooltip label={t('sidebar.club_profile')} collapsed={collapsed}>
                <Link to="/club" className={linkClass('/club', clubChildPaths)} onClick={() => { setMobileOpen(false); setClubOpenOverride(true); }}>
                  <Building2 className="w-4 h-4 shrink-0" />
                  {!collapsed && t('sidebar.club_profile')}
                </Link>
              </SidebarTooltip>
            </CollapsibleParent>
          </FeatureGate>
        )}

        {!collapsed && canView('club_profile') && clubOpen && (
          <div className="pl-7 space-y-0.5">
            {canView('my_clubs') && (
              <Link to="/my-clubs" className={subLinkClass(isActive('/my-clubs'))} onClick={() => setMobileOpen(false)}>
                <Heart className="w-3.5 h-3.5" />
                {t('sidebar.my_clubs')}
              </Link>
            )}
          </div>
        )}

        {/* ── Communauté ── */}
        {canView('community') && (
          <FeatureGate featureKey="feature_community" inline>
            <SidebarTooltip label={t('sidebar.community')} collapsed={collapsed}>
              <Link to="/community" className={linkClass('/community')} onClick={() => setMobileOpen(false)}>
                <MessageSquare className="w-4 h-4 shrink-0" />
                {!collapsed && (
                  <span className="flex items-center gap-2">
                    {t('sidebar.community')}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">PRO</span>
                  </span>
                )}
              </Link>
            </SidebarTooltip>
          </FeatureGate>
        )}

        {/* ── Booking ── */}
        {canView('booking') && (
          <FeatureGate featureKey="feature_booking" inline>
            <SidebarTooltip label={t('sidebar.booking')} collapsed={collapsed}>
              <Link to="/booking" className={linkClass('/booking')} onClick={() => setMobileOpen(false)}>
                <CalendarCheck className="w-4 h-4 shrink-0" />
                {!collapsed && t('sidebar.booking')}
              </Link>
            </SidebarTooltip>
          </FeatureGate>
        )}

        {/* ── Import de données ── */}
        {canView('data_import') && (
          <SidebarTooltip label={t('sidebar.data_import')} collapsed={collapsed}>
            <Link to="/data-import" className={linkClass('/data-import')} onClick={() => setMobileOpen(false)}>
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              {!collapsed && t('sidebar.data_import')}
            </Link>
          </SidebarTooltip>
        )}

        {/* ── Affiliation ── */}
        {canView('affiliate') && (
          <FeatureGate featureKey="feature_affiliate" inline>
            <SidebarTooltip label={t('sidebar.affiliate')} collapsed={collapsed}>
              <Link to="/affiliate" className={linkClass('/affiliate')} onClick={() => setMobileOpen(false)}>
                <Gift className="w-4 h-4 shrink-0" />
                {!collapsed && t('sidebar.affiliate')}
              </Link>
            </SidebarTooltip>
          </FeatureGate>
        )}
      </nav>

      {/* Upgrade CTA — free users only */}
      {!isPremium && (
        <div className={cn('pb-3', collapsed ? 'px-2' : 'px-3')}>
          <SidebarTooltip label={t('sidebar.upgrade')} collapsed={collapsed}>
            <Link
              to="/pricing"
              className={cn(
                'flex items-center gap-3 rounded-xl text-sm font-bold bg-gradient-to-r from-sidebar-primary to-accent text-sidebar-primary-foreground hover:opacity-90 transition-all shadow-lg shadow-sidebar-primary/20',
                collapsed ? 'justify-center px-2 py-3' : 'px-4 py-3'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              {!collapsed && t('sidebar.upgrade')}
            </Link>
          </SidebarTooltip>
        </div>
      )}

      {/* Footer */}
      <div className={cn('py-3 border-t border-sidebar-border shrink-0', collapsed ? 'px-2' : 'px-3')}>
        <div className="space-y-0.5">
          {isAdmin && (
            <SidebarTooltip label={t('sidebar.administration')} collapsed={collapsed}>
              <Link to="/admin" className={footerLinkClass('/admin')} onClick={() => setMobileOpen(false)}>
                <Shield className="w-3.5 h-3.5 shrink-0" />
                {!collapsed && t('sidebar.administration')}
              </Link>
            </SidebarTooltip>
          )}
          {isAdmin && (
            <SidebarTooltip label={t('sidebar.tickets')} collapsed={collapsed}>
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

          <SidebarTooltip label={t('sidebar.my_account')} collapsed={collapsed}>
            <Link to="/account" className={footerLinkClass('/account')} onClick={() => setMobileOpen(false)}>
              <UserCircle className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && t('sidebar.my_account')}
            </Link>
          </SidebarTooltip>

          {canView('settings') && (
            <SidebarTooltip label={t('sidebar.settings')} collapsed={collapsed}>
              <Link to="/settings" className={footerLinkClass('/settings')} onClick={() => setMobileOpen(false)}>
                <Settings className="w-3.5 h-3.5 shrink-0" />
                {!collapsed && t('sidebar.settings')}
              </Link>
            </SidebarTooltip>
          )}

          <SidebarTooltip label={t('sidebar.report_issue')} collapsed={collapsed}>
            <button onClick={() => { setReportOpen(true); setMobileOpen(false); }} className={footerBtnClass}>
              <Bug className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && t('sidebar.report_issue')}
            </button>
          </SidebarTooltip>

          <SidebarTooltip label={t('sidebar.my_tickets')} collapsed={collapsed}>
            <Link to="/my-tickets" className={footerLinkClass('/my-tickets')} onClick={() => setMobileOpen(false)}>
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && t('sidebar.my_tickets')}
            </Link>
          </SidebarTooltip>

          <SidebarTooltip label={t('sidebar.signout')} collapsed={collapsed}>
            <button onClick={handleSignOut} className={footerBtnClass}>
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && t('sidebar.signout')}
            </button>
          </SidebarTooltip>
        </div>

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
                <Link to="/about" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.about')}
                </Link>
                <Link to="/privacy" className="block text-[10px] text-sidebar-muted hover:text-sidebar-foreground transition-colors" onClick={() => { setMobileOpen(false); setLegalOpen(false); }}>
                  {t('footer.privacy')}
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
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-card shadow-md border border-border"
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

      <ReportIssueDialog open={reportOpen} onOpenChange={setReportOpen} />
    </>
  );
}
