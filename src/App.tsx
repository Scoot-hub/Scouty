import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import Players from "@/pages/Players";
import PlayerProfile from "@/pages/PlayerProfile";
import AddPlayer from "@/pages/AddPlayer";
import EditPlayer from "@/pages/EditPlayer";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import Pricing from "@/pages/Pricing";
import PremiumSuccess from "@/pages/PremiumSuccess";
import Account from "@/pages/Account";
import Organization from "@/pages/Organization";
import OrgPlayers from "@/pages/OrgPlayers";
import Squad from "@/pages/Squad";
import Watchlist from "@/pages/Watchlist";
import ShadowTeamPage from "@/pages/ShadowTeam";
import Fixtures from "@/pages/Fixtures";
import MyMatches from "@/pages/MyMatches";
import OrgRoadmap from "@/pages/OrgRoadmap";
import Contacts from "@/pages/Contacts";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import NotFound from "@/pages/NotFound";
import { Analytics } from "@vercel/analytics/next"
<Analytics>
</Analytics>
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/pricing" element={<Pricing />} />

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
                <Route path="/my-matches" element={<MyMatches />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/premium-success" element={<PremiumSuccess />} />
                <Route path="/account" element={<Account />} />
                <Route path="/organization" element={<Organization />} />
                <Route path="/organization/:orgSlug" element={<Organization />} />
                <Route path="/organization/:orgSlug/squad" element={<Squad />} />
                <Route path="/organization/:orgSlug/players" element={<OrgPlayers />} />
                <Route path="/organization/:orgSlug/roadmap" element={<OrgRoadmap />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
