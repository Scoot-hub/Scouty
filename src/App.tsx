import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import VercelAnalytics from "@/components/VercelAnalytics";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import CookieBanner from "@/components/CookieBanner";
import { ThemeProvider } from "@/components/ThemeProvider";

const Landing = lazy(() => import("@/pages/Landing"));
const Auth = lazy(() => import("@/pages/Auth"));
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
const ShadowTeamPage = lazy(() => import("@/pages/ShadowTeam"));
const Fixtures = lazy(() => import("@/pages/Fixtures"));
const MyMatches = lazy(() => import("@/pages/MyMatches"));
const OrgRoadmap = lazy(() => import("@/pages/OrgRoadmap"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Legal = lazy(() => import("@/pages/Legal"));
const About = lazy(() => import("@/pages/About"));
const Affiliate = lazy(() => import("@/pages/Affiliate"));
const Checkout = lazy(() => import("@/pages/Checkout"));
const CGV = lazy(() => import("@/pages/CGV"));
const CGU = lazy(() => import("@/pages/CGU"));
const Booking = lazy(() => import("@/pages/Booking"));
const Discover = lazy(() => import("@/pages/Discover"));
const Community = lazy(() => import("@/pages/Community"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));
const ClubProfile = lazy(() => import("@/pages/ClubProfile"));
const MyClubs = lazy(() => import("@/pages/MyClubs"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const AdminAnalytics = lazy(() => import("@/pages/AdminAnalytics"));
const Championships = lazy(() => import("@/pages/Championships"));
const MapView = lazy(() => import("@/pages/MapView"));
const MatchDetail = lazy(() => import("@/pages/MatchDetail"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,        // 2 min — data is fresh for 2 min after fetch
      gcTime: 10 * 60 * 1000,           // 10 min — keep unused cache for 10 min
      refetchOnWindowFocus: false,       // don't refetch when user alt-tabs back
      retry: 1,                          // retry once on failure
    },
  },
});

const App = () => (
  <ThemeProvider>
  <UiPreferencesProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Suspense fallback={null}>
          <Routes>
            {/* Public routes */}
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

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Navigate to="/players" replace />} />
                <Route path="/players" element={<Players />} />
                <Route path="/player/new" element={<AddPlayer />} />
                <Route path="/player/:id" element={<PlayerProfile />} />
                <Route path="/player/:id/edit" element={<EditPlayer />} />
                <Route path="/watchlist" element={<Watchlist />} />
                <Route path="/shadow-team" element={<ShadowTeamPage />} />
                <Route path="/fixtures" element={<Fixtures />} />
                <Route path="/match/:matchId" element={<MatchDetail />} />
                <Route path="/my-matches" element={<MyMatches />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/roles" element={<AdminRoles />} />
                <Route path="/admin/analytics" element={<AdminAnalytics />} />
                <Route path="/admin/tickets" element={<AdminTickets />} />
                <Route path="/admin/settings" element={<AdminSettings />} />
                <Route path="/admin/notifications" element={<AdminNotifications />} />
                <Route path="/my-tickets" element={<MyTickets />} />
                <Route path="/premium-success" element={<PremiumSuccess />} />
                <Route path="/account" element={<Account />} />
                <Route path="/organization" element={<Organization />} />
                <Route path="/organization/:orgSlug" element={<Organization />} />
                <Route path="/organization/:orgSlug/squad" element={<Squad />} />
                <Route path="/organization/:orgSlug/players" element={<OrgPlayers />} />
                <Route path="/organization/:orgSlug/player/:id" element={<PlayerProfile />} />
                <Route path="/organization/:orgSlug/roadmap" element={<OrgRoadmap />} />
                <Route path="/booking" element={<Booking />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/community" element={<Community />} />
                <Route path="/profile/:userId" element={<UserProfile />} />
                <Route path="/club" element={<ClubProfile />} />
                <Route path="/my-clubs" element={<MyClubs />} />
                <Route path="/championships" element={<Championships />} />
                <Route path="/map" element={<MapView />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/affiliate" element={<Affiliate />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      <CookieBanner />
      </BrowserRouter>
      <VercelAnalytics />
    </TooltipProvider>
  </QueryClientProvider>
  </UiPreferencesProvider>
  </ThemeProvider>
);

export default App;
