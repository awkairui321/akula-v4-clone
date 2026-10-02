import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { ActiveProfileProvider, useActiveProfile } from "@/contexts/active-profile-context";
import { landingPathForRole } from "@/lib/roles";
import ErrorBoundary from "@/components/error-boundary";
import AppLayout from "@/components/app-layout";
import LucaLayout from "@/components/luca-layout";
import WorkflowPage from "@/features/workspace/workflow-page";
import LiveComparePage from "@/features/workspace/live-compare";
import LandingPage from "@/features/unauthenticated/landing";
import LoginPage from "@/features/unauthenticated/login";
import SignupPage from "@/features/unauthenticated/signup";
import OnboardingPage from "@/features/investor/onboarding/onboarding";
import ConfirmPage from "@/features/unauthenticated/confirm";
import ForgotPasswordPage from "@/features/unauthenticated/forgot-password";
import ResetPasswordPage from "@/features/unauthenticated/reset-password";
import FundsPage from "@/features/investor/funds";
import FundDetailPage from "@/features/investor/fund-detail";
import CheckoutPage from "@/features/investor/checkout";
import PortfolioPage from "@/features/investor/portfolio";
import AccountPage from "@/features/investor/account";
import SupportPage from "@/features/investor/support";
import MessagesPage from "@/features/investor/messages";
import DocumentsPage from "@/features/investor/documents";
import DiscoverPage from "@/features/investor/discover";
import DiscoverDetailPage from "@/features/investor/discover-detail";
import AdminDashboard from "@/features/admin/dashboard";
import AdminVehiclesPage from "@/features/admin/vehicles/vehicles";
import AdminVehicleOverviewPage from "@/features/admin/vehicles/vehicle-overview";
import AdminSubscriptionsPage from "@/features/admin/subscription-inbox";
import AdminSubscriptionHistoryPage from "@/features/admin/subscription-history";
import AdminCompliancePage from "@/features/admin/compliance";
import CommunicationsPage from "@/features/admin/communications";
import ComposeCommunicationPage from "@/features/admin/communications/compose";
import CommunicationDetailPage from "@/features/admin/communications/detail";
import LucaOnboardingPage from "@/features/admin/onboarding";
import AdminInvestorDetailPage from "@/features/admin/investors/investor-detail";
import AdminPartnersPage from "@/features/admin/partners";
import AdminPartnerDetailPage from "@/features/admin/partners/partner-detail";
import EamLayout from "@/components/eam-layout";
import EamDashboard from "@/features/eam/dashboard";
import EamClientsPage from "@/features/eam/clients/index";
import EamClientDetailPage from "@/features/eam/clients/client-detail";
import EamOpportunitiesPage from "@/features/eam/opportunities";
import EamProfilePage from "@/features/eam/profile";
import EamRevenuePage from "@/features/eam/revenue";
import EamOpportunityDetailPage from "@/features/eam/opportunity-detail";
import EamDocumentsPage from "@/features/eam/documents";
import EamSupportPage from "@/features/eam/support";
import EamReportsPage from "@/features/eam/reports";

// Instrumented <Routes> for named route traces.
const SentryRoutes = Sentry.wrapReactRouterRouting(Routes);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function GuestOnly() {
  const { user, loading } = useAuth();
  const { activeProfile } = useActiveProfile();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to={landingPathForRole(user, activeProfile)} replace />;
  }

  return <Outlet />;
}

function AuthRequired() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function OnboardedRoute() {
  const { user } = useAuth();
  const { activeProfile } = useActiveProfile();

  // Guards investor-only routes. A user without an investor profile at all
  // (e.g. eam-only) has no business here — send them to their actual home
  // rather than the investor onboarding flow.
  if (!user?.has_investor_profile) {
    return <Navigate to={landingPathForRole(user, activeProfile)} replace />;
  }

  if (!user.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

function LucaRoute() {
  const { user } = useAuth();

  if (user?.role !== "luca") {
    return <Navigate to="/funds" replace />;
  }

  return <Outlet />;
}

function OpsRoute() {
  const { user } = useAuth();
  return user?.role === "ops" ? <Outlet /> : <Navigate to="/workflows" replace />;
}

function EamRoute() {
  const { user } = useAuth();

  // LUCA users are deliberately excluded here — they must never reach the
  // EAM or investor portals, only their own /luca/* routes.
  if (!user?.has_eam_profile) {
    return <Navigate to="/funds" replace />;
  }

  return <Outlet />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster richColors position="top-right" />
        <BrowserRouter>
          <AuthProvider>
            <ActiveProfileProvider>
              <SentryRoutes>
                {/* The public front page is the entry point for every demo role. */}
                <Route path="/" element={<LandingPage />} />
                {/* Unauthenticated */}
                <Route element={<GuestOnly />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                </Route>
                <Route path="/confirm" element={<ConfirmPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                {/* Authenticated */}
                <Route element={<AuthRequired />}>
                  <Route path="/workflows" element={<WorkflowPage />} />
                  <Route element={<OpsRoute />}>
                    <Route path="/ops/publication/:id" element={<AdminVehicleOverviewPage ops />} />
                  </Route>
                  <Route path="/live-demo" element={<LiveComparePage />} />
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  <Route path="/onboarding/:section" element={<OnboardingPage />} />
                  {/* Onboarded */}
                  <Route element={<OnboardedRoute />}>
                    <Route path="/checkout/:fundId" element={<CheckoutPage />} />
                    <Route element={<AppLayout />}>
                      <Route path="/funds" element={<FundsPage />} />
                      <Route path="/funds/:id" element={<FundDetailPage />} />
                      <Route path="/discover" element={<DiscoverPage />} />
                      <Route path="/discover/:id" element={<DiscoverDetailPage />} />
                      <Route path="/portfolio" element={<PortfolioPage />} />
                      <Route path="/documents" element={<DocumentsPage />} />
                      <Route path="/messages" element={<MessagesPage />} />
                      <Route path="/account" element={<AccountPage />} />
                      <Route path="/support" element={<SupportPage />} />
                    </Route>
                  </Route>
                </Route>
                <Route element={<AuthRequired />}>
                  {/* LUCA (fund manager) */}
                  <Route element={<LucaRoute />}>
                    <Route element={<LucaLayout />}>
                      <Route path="/luca" element={<AdminDashboard />} />
                      <Route path="/luca/subscriptions" element={<AdminSubscriptionsPage />} />
                      <Route
                        path="/luca/subscriptions/history"
                        element={<AdminSubscriptionHistoryPage />}
                      />
                      <Route path="/luca/onboarding" element={<LucaOnboardingPage />} />
                      <Route
                        path="/luca/fund-search"
                        element={<Navigate to="/luca/onboarding?mode=funds" replace />}
                      />
                      <Route
                        path="/luca/eam-search"
                        element={<Navigate to="/luca/onboarding?mode=entities" replace />}
                      />
                      <Route path="/luca/investors/:id" element={<AdminInvestorDetailPage />} />
                      <Route path="/luca/partners" element={<AdminPartnersPage />} />
                      <Route path="/luca/partners/:id" element={<AdminPartnerDetailPage />} />
                      <Route path="/luca/compliance" element={<AdminCompliancePage />} />
                      <Route
                        path="/luca/documents"
                        element={<Navigate to="/luca/compliance" replace />}
                      />
                      <Route path="/luca/communications" element={<CommunicationsPage />} />
                      <Route
                        path="/luca/communications/new"
                        element={<ComposeCommunicationPage />}
                      />
                      <Route
                        path="/luca/communications/:id"
                        element={<CommunicationDetailPage />}
                      />
                      <Route path="/luca/deals" element={<AdminVehiclesPage />} />
                      <Route path="/luca/deals/:id" element={<AdminVehicleOverviewPage />} />
                    </Route>
                  </Route>
                </Route>
                {/* EAM */}
                <Route element={<AuthRequired />}>
                  <Route element={<EamRoute />}>
                    <Route element={<EamLayout />}>
                      <Route path="/eam" element={<EamDashboard />} />
                      <Route path="/eam/clients" element={<EamClientsPage />} />
                      <Route path="/eam/clients/:id" element={<EamClientDetailPage />} />
                      <Route path="/eam/opportunities" element={<EamOpportunitiesPage />} />
                      <Route path="/eam/opportunities/:id" element={<EamOpportunityDetailPage />} />
                      <Route path="/eam/documents" element={<EamDocumentsPage />} />
                      <Route path="/eam/support" element={<EamSupportPage />} />
                      <Route path="/eam/reports" element={<EamReportsPage />} />
                      <Route path="/eam/revenue" element={<EamRevenuePage />} />
                      <Route path="/eam/profile" element={<EamProfilePage />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="/dashboard" element={<Navigate to="/portfolio" replace />} />
              </SentryRoutes>
            </ActiveProfileProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
