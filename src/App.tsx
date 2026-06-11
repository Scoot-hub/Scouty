import { lazy, Suspense, useEffect, useCallback, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import VercelAnalytics from "@/components/VercelAnalytics";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import DataGuard from "@/components/layout/DataGuard";
import AppLayout from "@/components/layout/AppLayout";
import PageLoader from "@/components/PageLoader";
import CookieBanner from "@/components/CookieBanner";
import { ThemeProvider } from "@/components/ThemeProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import TopProgressBar from "@/components/TopProgressBar";
// Auth is eagerly imported — it must never suspend (users need it immediately when not logged in)
import Auth from "@/pages/Auth";

function BanGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const enforcingRef = useRef(false);

  // Poll every 10s to detect bans applied while the user is already logged in
  const { data: runtimeBan } = useQuery({
    queryKey: ['ban-status-runtime'],
    queryFn: () => fetch('/api/my-ban-status', { credentials: 'include' }).then(r => r.json()),
    enabled: !!user && !user.is_banned && !enforcingRef.current,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const enforceBan = useCallback((reason: string | null, expiresAt: string | null) => {
    if (enforcingRef.current) return;
    enforcingRef.current = true;
    // Store ban info before anything else so /banned can display it without a session
    localStorage.setItem('scouthub_ban_info', JSON.stringify({ reason, expiresAt }));
    // Navigate first — before signOut clears the user and ProtectedRoute could redirect elsewhere
    navigate('/banned', { replace: true });
    // Expire the session cookie in the background
    signOut().catch(() => {});
  }, [signOut, navigate]);

  // Case 1: ban already set in session on page load
  useEffect(() => {
    if (loading || location.pathname === '/banned') return;
    if (user?.is_banned) {
      enforceBan(user.ban_reason ?? null, user.ban_expires_at ?? null);
    }
  }, [user?.is_banned, loading, enforceBan]);

  // Case 2: ban applied while user is currently logged in
  useEffect(() => {
    if (!runtimeBan?.isBanned || location.pathname === '/banned') return;
    enforceBan(runtimeBan.reason ?? null, runtimeBan.expiresAt ?? null);
  }, [runtimeBan?.isBanned, enforceBan]);

  return <>{children}</>;
}

// ── URL security guard — detects SQLi / XSS patterns in the current URL ──────
const SQLI_RE = /(\bunion\b[\s\S]{0,40}\bselect\b|\bselect\b[\s\S]{0,40}\bfrom\b|\bdrop\b[\s\S]{0,20}\btable\b|\binsert\b[\s\S]{0,20}\binto\b|\bdelete\b[\s\S]{0,20}\bfrom\b|--|'[\s\S]{0,10}(or|and)[\s\S]{0,10}'|xp_|\bexec\b\s*\(|\bsleep\s*\(|\bbenchmark\s*\()/i;
const XSS_RE  = /<script[\s>]|javascript\s*:|on\w{2,20}\s*=|document\.(cookie|write)|<iframe[\s>]|\balert\s*\(|%3cscript|%3e.*%3c/i;

function useUrlSecurityGuard() {
  const location = useLocation();
  const navigate  = useNavigate();
  useEffect(() => {
    if (location.pathname === '/blocked') return;
    const raw = location.pathname + location.search + location.hash;
    const decoded = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
    if (SQLI_RE.test(decoded)) { navigate('/blocked?type=sqli', { replace: true }); return; }
    if (XSS_RE.test(decoded))  { navigate('/blocked?type=xss',  { replace: true }); return; }
  }, [location.pathname, location.search, location.hash, navigate]);
}

const Landing = lazy(() => import("@/pages/Landing"));
const Players = lazy(() => import("@/pages/Players"));
const PlayerProfile = lazy(() => import("@/pages/PlayerProfile"));
const AddPlayer = lazy(() => import("@/pages/AddPlayer"));
const EditPlayer = lazy(() => import("@/pages/EditPlayer"));
const Settings = lazy(() => import("@/pages/Settings"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminTickets = lazy(() => import("@/pages/AdminTickets"));
const AdminRoles = lazy(() => import("@/pages/AdminRoles"));
const AdminSettings = lazy(() => import("@/pages/AdminSettings"));
const AdminNotifications = lazy(() => import("@/pages/AdminNotifications"));
const MyTickets = lazy(() => import("@/pages/MyTickets"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const PremiumSuccess = lazy(() => import("@/pages/PremiumSuccess"));
const Account = lazy(() => import("@/pages/Account"));
const Organization = lazy(() => import("@/pages/Organization"));
const OrgPlayers = lazy(() => import("@/pages/OrgPlayers"));
const Squad = lazy(() => import("@/pages/Squad"));
const Watchlist = lazy(() => import("@/pages/Watchlist"));
const Transfers = lazy(() => import("@/pages/Transfers"));
const ShadowTeamPage = lazy(() => import("@/pages/ShadowTeam"));
const Fixtures = lazy(() => import("@/pages/Fixtures"));
const MyMatches = lazy(() => import("@/pages/MyMatches"));
const MyChampionships = lazy(() => import("@/pages/MyChampionships"));
const OrgRoadmap = lazy(() => import("@/pages/OrgRoadmap"));
const OrgChat = lazy(() => import("@/pages/OrgChat"));
const OrgDashboard = lazy(() => import("@/pages/OrgDashboard"));
const OrgShortlist = lazy(() => import("@/pages/OrgShortlist"));
const OrgAnalytics = lazy(() => import("@/pages/OrgAnalytics"));
const OrgDiscover = lazy(() => import("@/pages/OrgDiscover"));
const OrgPublicProfile = lazy(() => import("@/pages/OrgPublicProfile"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Legal = lazy(() => import("@/pages/Legal"));
const About = lazy(() => import("@/pages/About"));
const Affiliate = lazy(() => import("@/pages/Affiliate"));
const Checkout = lazy(() => import("@/pages/Checkout"));
const BuyCredits = lazy(() => import("@/pages/BuyCredits"));
const CGV = lazy(() => import("@/pages/CGV"));
const CGU = lazy(() => import("@/pages/CGU"));
const Booking = lazy(() => import("@/pages/Booking"));
const Discover = lazy(() => import("@/pages/Discover"));
const Community = lazy(() => import("@/pages/Community"));
const CommunityPost = lazy(() => import("@/pages/CommunityPost"));
const News = lazy(() => import("@/pages/News"));
const Buzz = lazy(() => import("@/pages/Buzz"));
const BuzzArticle = lazy(() => import("@/pages/BuzzArticle"));
const XPage = lazy(() => import("@/pages/X"));
const Instagram = lazy(() => import("@/pages/Instagram"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));
const ClubProfile = lazy(() => import("@/pages/ClubProfile"));
const ClubSearch = lazy(() => import("@/pages/ClubSearch"));
const MyClubs = lazy(() => import("@/pages/MyClubs"));
const ClubContacts = lazy(() => import("@/pages/ClubContacts"));
const ClubRecruitment = lazy(() => import("@/pages/ClubRecruitment"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const CookiesPolicy = lazy(() => import("@/pages/CookiesPolicy"));
const Accessibility = lazy(() => import("@/pages/Accessibility"));
const AdminAnalytics = lazy(() => import("@/pages/AdminAnalytics"));
const AdminCredits = lazy(() => import("@/pages/AdminCredits"));
const AdminCrons = lazy(() => import("@/pages/AdminCrons"));
const AdminErrors = lazy(() => import("@/pages/AdminErrors"));
const Championships = lazy(() => import("@/pages/Championships"));
const ChampionshipCalendar = lazy(() => import("@/pages/ChampionshipCalendar"));
const MapView = lazy(() => import("@/pages/MapView"));
const MatchDetail = lazy(() => import("@/pages/MatchDetail"));
const DataImport = lazy(() => import("@/pages/DataImport"));
const Onboarding = lazy(() => import("@/pages/Onboarding"));
const Editorial = lazy(() => import("@/pages/Editorial"));
const EditorialEditor = lazy(() => import("@/pages/EditorialEditor"));
const EditorialView = lazy(() => import("@/pages/EditorialView"));
const EditorialShare = lazy(() => import("@/pages/EditorialShare"));
const PlayerCompare = lazy(() => import("@/pages/PlayerCompare"));
const WyscoutPlayerData = lazy(() => import("@/pages/WyscoutPlayerData"));
const DataHub = lazy(() => import("@/pages/DataHub"));
const DataExplore = lazy(() => import("@/pages/DataExplore"));
const DataScatter = lazy(() => import("@/pages/DataScatter"));
const DataProfile = lazy(() => import("@/pages/DataProfile"));
const DataProjection = lazy(() => import("@/pages/DataProjection"));
const Banned = lazy(() => import("@/pages/Banned"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const SecurityBlock = lazy(() => import("@/pages/SecurityBlock"));
const SavedMatchDetail = lazy(() => import("@/pages/SavedMatchDetail"));
const MyMatchDetail = lazy(() => import("@/pages/MyMatchDetail"));

// Inner wrapper — lives inside BrowserRouter so hooks can call useLocation/useNavigate
function AppInner() {
  useUrlSecurityGuard();
  return null;
}

const App = () => {
  // The static-loader (index.html) is a fixed z-9999 overlay shown until the
  // app boots. It must be removed unconditionally once React has rendered —
  // PageLoader only removes it when Suspense fires, which doesn't happen on
  // eagerly-imported routes (e.g. /auth) or when ProtectedRoute renders its
  // own inline loader, leaving the static-loader stuck on top forever.
  useEffect(() => {
    document.getElementById("static-loader")?.remove();
  }, []);

  return (
  <ThemeProvider>
  <ErrorBoundary>
  <UiPreferencesProvider>
  <QueryClientProvider client={queryClient}>
    <TopProgressBar />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppInner />
        <AuthProvider>
          <BanGuard>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/blocked" element={<SecurityBlock />} />
            <Route path="/banned" element={<Banned />} />
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/legal" element={<Legal />} />
            <Route path="/cgv" element={<CGV />} />
            <Route path="/cgu" element={<CGU />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/share/article/:id" element={<EditorialShare />} />
            <Route path="/cookies" element={<CookiesPolicy />} />
            <Route path="/accessibility" element={<Accessibility />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              {/* Onboarding — plein écran, sans sidebar */}
              <Route path="/welcome" element={<Onboarding />} />
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Navigate to="/players" replace />} />
                <Route path="/players" element={<Players />} />
                <Route path="/player/new" element={<AddPlayer />} />
                <Route path="/player/:id" element={<PlayerProfile />} />
                <Route path="/player/:id/edit" element={<EditPlayer />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/transfers" element={<Transfers />} />
                <Route path="/shadow-team" element={<ShadowTeamPage />} />
                <Route path="/fixtures" element={<Fixtures />} />
                <Route path="/match/:matchId" element={<MatchDetail />} />
                <Route path="/match-library" element={<Navigate to="/my-matches" replace />} />
                <Route path="/saved-match/:id" element={<SavedMatchDetail />} />
                <Route path="/my-matches" element={<MyMatches />} />
                <Route path="/my-matches/:id" element={<MyMatchDetail />} />
                <Route path="/my-championships" element={<MyChampionships />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/roles" element={<AdminRoles />} />
                <Route path="/admin/analytics" element={<AdminAnalytics />} />
                <Route path="/admin/tickets" element={<AdminTickets />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/notifications" element={<AdminNotifications />} />
                <Route path="/admin/credits" element={<AdminCredits />} />
                <Route path="/admin/crons" element={<AdminCrons />} />
                <Route path="/admin/errors" element={<AdminErrors />} />
                <Route path="/my-tickets" element={<MyTickets />} />
                <Route path="/premium-success" element={<PremiumSuccess />} />
                <Route path="/account" element={<Account />} />
                <Route path="/organization" element={<Organization />} />
                <Route path="/organization/discover" element={<OrgDiscover />} />
                <Route path="/organization/discover/:orgId" element={<OrgPublicProfile />} />
                <Route path="/organization/:orgSlug" element={<Navigate to="dashboard" replace />} />
                <Route path="/organization/:orgSlug/settings" element={<Organization />} />
                <Route path="/organization/:orgSlug/dashboard" element={<OrgDashboard />} />
                <Route path="/organization/:orgSlug/squad" element={<Squad />} />
                <Route path="/organization/:orgSlug/players" element={<OrgPlayers />} />
                <Route path="/organization/:orgSlug/player/:id" element={<PlayerProfile />} />
                <Route path="/organization/:orgSlug/shortlist" element={<OrgShortlist />} />
                <Route path="/organization/:orgSlug/roadmap" element={<OrgRoadmap />} />
                <Route path="/organization/:orgSlug/chat" element={<OrgChat />} />
                <Route path="/organization/:orgSlug/analytics" element={<OrgAnalytics />} />
                <Route path="/booking" element={<Booking />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/community" element={<Community />} />
                <Route path="/community/:postId" element={<CommunityPost />} />
                <Route path="/news" element={<News />} />
                <Route path="/buzz" element={<Buzz />} />
                <Route path="/buzz/article" element={<BuzzArticle />} />
                <Route path="/x" element={<XPage />} />
                <Route path="/instagram" element={<Instagram />} />
                <Route path="/profile/:userId" element={<UserProfile />} />
                <Route path="/club-search" element={<ClubSearch />} />
                <Route path="/club" element={<ClubProfile />} />
                <Route path="/my-clubs" element={<MyClubs />} />
                <Route path="/club-contacts" element={<ClubContacts />} />
                <Route path="/club-recruitment" element={<ClubRecruitment />} />
                <Route path="/championships" element={<Championships />} />
                <Route path="/championship-calendar" element={<ChampionshipCalendar />} />
                <Route element={<DataGuard />}>
                  <Route path="/data" element={<DataHub />} />
                  <Route path="/data/explore" element={<DataExplore />} />
                  <Route path="/data/scatter" element={<DataScatter />} />
                  <Route path="/data/profile" element={<DataProfile />} />
                  <Route path="/data/projection" element={<DataProjection />} />
                  <Route path="/data/compare" element={<PlayerCompare />} />
                  <Route path="/data/player/:id" element={<WyscoutPlayerData />} />
                </Route>
                <Route path="/compare" element={<Navigate to="/data/compare" replace />} />
                <Route path="/map" element={<MapView />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/buy-credits" element={<BuyCredits />} />
                <Route path="/affiliate" element={<Affiliate />} />
                <Route path="/data-import" element={<DataImport />} />
                <Route path="/editorial" element={<Editorial />} />
                <Route path="/editorial/new" element={<EditorialEditor />} />
                <Route path="/editorial/:id" element={<EditorialView />} />
                <Route path="/editorial/:id/edit" element={<EditorialEditor />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </BanGuard>
        </AuthProvider>
      <CookieBanner />
      </BrowserRouter>
      <VercelAnalytics />
    </TooltipProvider>
  </QueryClientProvider>
  </UiPreferencesProvider>
  </ErrorBoundary>
  </ThemeProvider>
  );
};

export default App;
