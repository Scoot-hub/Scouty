import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users, Menu, X, LogOut, Settings, Shield, UserCircle, Eye, Sparkles, Building2, Bug, CalendarDays, CalendarCheck, Shirt, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Route, MapPinned, Gift, Search, Globe, Heart, MessageSquare, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin, useIsPremium } from '@/hooks/use-admin';
import { useMyOrganizations, slugify } from '@/hooks/use-organization';
import ReportIssueDialog from '@/components/ReportIssueDialog';
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

export default function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { data: isPremium } = useIsPremium();
  const { data: myOrgs } = useMyOrganizations();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);

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
      collapsed ? 'justify-center px-2 py-2.5' : 'px-4 py-2.5',
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

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Logo + collapse toggle */}
      {collapsed ? (
        <div className="py-6 flex flex-col items-center gap-2 px-2">
          <button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <img src={logo} alt="Scouty" className="w-6 h-6 rounded-xl shrink-0" />
        </div>
      ) : (
        <div className="py-6 flex items-center justify-between px-5">
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
      <nav className={cn('flex-1 space-y-1', collapsed ? 'px-2 overflow-hidden' : 'px-3 overflow-y-auto sidebar-scroll')}>
        <SidebarTooltip label={t('sidebar.players')} collapsed={collapsed}>
          <Link to="/players" className={linkClass('/players', ['/discover', '/watchlist', '/shadow-team'])} onClick={() => setMobileOpen(false)}>
            <Users className="w-4 h-4 shrink-0" />
            {!collapsed && t('sidebar.players')}
          </Link>
        </SidebarTooltip>

        {/* Sub-items — hidden when collapsed */}
        {!collapsed && (
          <div className="pl-7 space-y-0.5">
            <Link
              to="/discover"
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
                isActive('/discover')
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="flex items-center gap-2">
                {t('sidebar.discover')}
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-bold">PRO</span>
              </span>
            </Link>
            <Link
              to="/watchlist"
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
                isActive('/watchlist')
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <Eye className="w-3.5 h-3.5" />
              {t('sidebar.watchlist')}
            </Link>
            <Link
              to="/shadow-team"
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
                isActive('/shadow-team')
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <Shirt className="w-3.5 h-3.5" />
              {t('sidebar.shadow_team')}
            </Link>
          </div>
        )}

        <SidebarTooltip label={t('sidebar.organization')} collapsed={collapsed}>
          <Link to="/organization" className={linkClass('/organization', myOrgs?.map(o => `/organization/${slugify(o.name)}`) ?? [])} onClick={() => setMobileOpen(false)}>
            <Building2 className="w-4 h-4 shrink-0" />
            {!collapsed && t('sidebar.organization')}
          </Link>
        </SidebarTooltip>

        {/* Sub-items per organization — hidden when collapsed */}
        {!collapsed && myOrgs && myOrgs.length > 0 && (
          <div className="pl-7 space-y-0.5">
            {myOrgs.map((org: any) => {
              const slug = slugify(org.name);
              const orgBase = `/organization/${slug}`;
              const isOrgActive = location.pathname === orgBase || location.pathname.startsWith(orgBase + '/');
              return (
                <div key={org.id}>
                  <Link
                    to={orgBase}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
                      isOrgActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                    )}
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
                      <Link
                        to={`${orgBase}/squad`}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1 rounded-lg text-[12px] transition-all',
                          isActive(`${orgBase}/squad`)
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                        )}
                        onClick={() => setMobileOpen(false)}
                      >
                        <ClipboardList className="w-3 h-3" />
                        {t('sidebar.squad')}
                      </Link>
                      <Link
                        to={`${orgBase}/players`}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1 rounded-lg text-[12px] transition-all',
                          isActive(`${orgBase}/players`)
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                        )}
                        onClick={() => setMobileOpen(false)}
                      >
                        <Users className="w-3 h-3" />
                        {t('sidebar.org_players')}
                      </Link>
                      <Link
                        to={`${orgBase}/roadmap`}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-1 rounded-lg text-[12px] transition-all',
                          isActive(`${orgBase}/roadmap`)
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                        )}
                        onClick={() => setMobileOpen(false)}
                      >
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

        <SidebarTooltip label={t('sidebar.fixtures')} collapsed={collapsed}>
          <Link to="/fixtures" className={linkClass('/fixtures', ['/my-matches', '/map', '/club', '/my-clubs'])} onClick={() => setMobileOpen(false)}>
            <CalendarDays className="w-4 h-4 shrink-0" />
            {!collapsed && t('sidebar.fixtures')}
          </Link>
        </SidebarTooltip>

        {!collapsed && (
          <div className="pl-7 space-y-0.5">
            <Link
              to="/my-matches"
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
                isActive('/my-matches')
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <MapPinned className="w-3.5 h-3.5" />
              {t('sidebar.my_matches')}
            </Link>
            <Link
              to="/map"
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
                isActive('/map')
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <Globe className="w-3.5 h-3.5" />
              {t('sidebar.map')}
            </Link>
            <Link
              to="/club"
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] transition-all',
                isActive('/club') || isActive('/my-clubs')
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
              onClick={() => setMobileOpen(false)}
            >
              <Building2 className="w-3.5 h-3.5" />
              {t('sidebar.club_profile')}
            </Link>
            {(isActive('/club') || isActive('/my-clubs')) && (
              <div className="pl-6 space-y-0.5">
                <Link
                  to="/my-clubs"
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-1 rounded-lg text-[12px] transition-all',
                    isActive('/my-clubs')
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
                  )}
                  onClick={() => setMobileOpen(false)}
                >
                  <Heart className="w-3 h-3" />
                  {t('sidebar.my_clubs')}
                </Link>
              </div>
            )}
          </div>
        )}

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

        <SidebarTooltip label={t('sidebar.booking')} collapsed={collapsed}>
          <Link to="/booking" className={linkClass('/booking')} onClick={() => setMobileOpen(false)}>
            <CalendarCheck className="w-4 h-4 shrink-0" />
            {!collapsed && t('sidebar.booking')}
          </Link>
        </SidebarTooltip>

        <SidebarTooltip label={t('sidebar.affiliate')} collapsed={collapsed}>
          <Link to="/affiliate" className={linkClass('/affiliate')} onClick={() => setMobileOpen(false)}>
            <Gift className="w-4 h-4 shrink-0" />
            {!collapsed && t('sidebar.affiliate')}
          </Link>
        </SidebarTooltip>
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

          <SidebarTooltip label={t('sidebar.my_account')} collapsed={collapsed}>
            <Link to="/account" className={footerLinkClass('/account')} onClick={() => setMobileOpen(false)}>
              <UserCircle className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && t('sidebar.my_account')}
            </Link>
          </SidebarTooltip>

          <SidebarTooltip label={t('sidebar.settings')} collapsed={collapsed}>
            <Link to="/settings" className={footerLinkClass('/settings')} onClick={() => setMobileOpen(false)}>
              <Settings className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && t('sidebar.settings')}
            </Link>
          </SidebarTooltip>

          <SidebarTooltip label={t('sidebar.report_issue')} collapsed={collapsed}>
            <button
              onClick={() => { setReportOpen(true); setMobileOpen(false); }}
              className={footerBtnClass}
            >
              <Bug className="w-3.5 h-3.5 shrink-0" />
              {!collapsed && t('sidebar.report_issue')}
            </button>
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
