import RmCommunications from "@/features/rm/communications";
import RmDeal from "@/features/rm/deal";
import {
  BrowserRouter,
  MemoryRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  Link,
} from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { demoPersonaId } from "@/lib/demo-persona";
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
import ActivatePage from "@/features/unauthenticated/activate";
import RmOnboardingList from "@/features/rm/onboarding-list";
import RmClientStatusPage from "@/features/rm/client-status";
import ClientOnboardingPage, { NewClientPage } from "@/features/rm/client-onboarding";
import OnboardingPage from "@/features/investor/onboarding/onboarding";
import ConfirmPage from "@/features/unauthenticated/confirm";
import ForgotPasswordPage from "@/features/unauthenticated/forgot-password";
import ResetPasswordPage from "@/features/unauthenticated/reset-password";
import FundsPage from "@/features/investor/funds";
import FundDetailPage from "@/features/investor/fund-detail";
import CheckoutPage from "@/features/investor/checkout";
import PortfolioPage from "@/features/investor/portfolio";
import AccountPage from "@/features/investor/account";
import MessagesPage from "@/features/investor/messages";
import DocumentsPage from "@/features/investor/documents";
import DiscoverPage from "@/features/investor/discover";
import DiscoverDetailPage from "@/features/investor/discover-detail";
import AdminDashboard from "@/features/admin/dashboard";
import AdminVehiclesPage from "@/features/admin/vehicles/vehicles";
import ProjectPage from "@/features/admin/vehicles/project";
import AdminVehicleOverviewPage from "@/features/admin/vehicles/vehicle-overview";
import AdminSubscriptionsPage from "@/features/admin/subscription-inbox";
import AllocationPage from "@/features/admin/allocation";
import AdminSubscriptionHistoryPage from "@/features/admin/subscription-history";
import AdminCompliancePage from "@/features/admin/compliance";
import CommunicationsPage from "@/features/admin/communications";
import ComposeCommunicationPage from "@/features/admin/communications/compose";
import CommunicationDetailPage from "@/features/admin/communications/detail";
import ClientsPage from "@/features/admin/clients";
import ClientReviewPage from "@/features/admin/client-review";
import AnalyticsPage from "@/features/admin/analytics";
import AdminInvestorDetailPage from "@/features/admin/investors/investor-detail";

import PartnerBookPage from "@/features/partners/partner-book";
import PartnerPage from "@/features/partners/partner-page";
import EamLayout from "@/components/eam-layout";
import EamDashboard from "@/features/eam/dashboard";
import EamClientsPage from "@/features/eam/clients/index";
import EamClientDetailPage from "@/features/eam/clients/client-detail";
import EamOpportunitiesPage from "@/features/eam/opportunities";
import EamProfilePage from "@/features/eam/profile";
import EamRevenuePage from "@/features/eam/revenue";
import EamOpportunityDetailPage from "@/features/eam/opportunity-detail";
import EamDocumentsPage from "@/features/eam/documents";
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

  if (!["luca", "investment_team"].includes(user?.role ?? "")) {
    return <Navigate to="/funds" replace />;
  }

  return <Outlet />;
}

function ManagerRoute() {
  const { user } = useAuth();
  return user?.role === "luca" ? <Outlet /> : <Navigate to="/luca/deals" replace />;
}
// Publication is the Investment Team's submission tracker; the Fund Manager approves from Deals.
function TeamRoute() {
  const { user } = useAuth();
  return user?.role === "investment_team" ? <Outlet /> : <Navigate to="/luca/deals" replace />;
}
function RmRoute() {
  const { user } = useAuth();
  return user?.role === "rm" ? <Outlet /> : <Navigate to="/workflows" replace />;
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

function DemoRouter({ children }: { children: ReactNode }) {
  useEffect(() => {
    const refresh = () => {
      queryClient.invalidateQueries();
    };
    window.addEventListener("akula-demo-sync", refresh);
    return () => window.removeEventListener("akula-demo-sync", refresh);
  }, []);
  if (demoPersonaId()) {
    const path = new URLSearchParams(window.location.search).get("demo_path") ?? "/";
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  }
  return <BrowserRouter>{children}</BrowserRouter>;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <Toaster richColors position="top-right" />
        <DemoRouter>
          <AuthProvider>
            <ActiveProfileProvider>
              <SentryRoutes>
                {/* The public front page is the entry point for every demo role. */}
                <Route path="/" element={<LandingPage />} />
                {/* Unauthenticated */}
                <Route element={<GuestOnly />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/activate" element={<ActivatePage />} />
                </Route>
                <Route path="/confirm" element={<ConfirmPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                {/* Authenticated */}
                <Route element={<AuthRequired />}>
                  <Route path="/workflows" element={<WorkflowPage />} />
                  <Route element={<OpsRoute />}>
                    <Route path="/ops" element={<WorkflowPage />} />
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
                      <Route path="/support" element={<Navigate to="/messages" replace />} />
                    </Route>
                  </Route>
                </Route>
                <Route element={<AuthRequired />}>
                  {/* LUCA (fund manager) */}
                  <Route element={<LucaRoute />}>
                    <Route element={<LucaLayout />}>
                      <Route path="/luca/deals" element={<AdminVehiclesPage />} />
                      <Route path="/luca/projects/:assetId" element={<ProjectPage />} />
                      <Route path="/luca/deals/:id" element={<AdminVehicleOverviewPage />} />
                      <Route element={<TeamRoute />}>
                        <Route
                          path="/luca/publication"
                          element={<WorkflowPage surface="Publication" compact />}
                        />
                      </Route>
                      <Route element={<ManagerRoute />}>
                        <Route path="/luca" element={<AdminDashboard />} />
                        <Route path="/luca/subscriptions" element={<AdminSubscriptionsPage />} />
                        <Route
                          path="/luca/subscriptions/:id/allocate"
                          element={<AllocationPage />}
                        />
                        <Route
                          path="/luca/subscriptions/history"
                          element={<AdminSubscriptionHistoryPage />}
                        />
                        <Route
                          path="/luca/onboarding"
                          element={<Navigate to="/luca/clients?tab=onboarding" replace />}
                        />
                        <Route
                          path="/luca/fund-search"
                          element={<Navigate to="/luca/deals" replace />}
                        />
                        <Route
                          path="/luca/eam-search"
                          element={<Navigate to="/luca/partners" replace />}
                        />
                        <Route path="/luca/investors/:id" element={<AdminInvestorDetailPage />} />
                        <Route path="/luca/partners" element={<PartnerBookPage />} />
                        <Route path="/luca/partners/:firm" element={<PartnerPage />} />
                        <Route path="/luca/clients" element={<ClientsPage />} />
                        <Route path="/luca/clients/:id/review" element={<ClientReviewPage />} />
                        <Route path="/luca/analytics" element={<AnalyticsPage />} />
                        <Route
                          path="/luca/opportunities"
                          element={<Navigate to="/luca/deals" replace />}
                        />
                        <Route
                          path="/luca/reports"
                          element={<Navigate to="/luca/partners" replace />}
                        />
                        <Route
                          path="/luca/reporting"
                          element={<WorkflowPage surface="Reporting" compact />}
                        />
                        <Route
                          path="/luca/support"
                          element={<Navigate to="/luca/communications" replace />}
                        />
                        <Route
                          path="/luca/client-documents"
                          element={<Navigate to="/luca/compliance?tab=clients" replace />}
                        />
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
                      </Route>
                    </Route>
                  </Route>
                </Route>
                <Route element={<AuthRequired />}>
                  <Route element={<RmRoute />}>
                    <Route element={<LucaLayout />}>
                      <Route path="/rm" element={<WorkflowPage surface="Overview" compact />} />
                      <Route
                        path="/rm/clients"
                        element={<WorkflowPage surface="Relationships" compact />}
                      />
                      <Route path="/rm/onboarding" element={<RmOnboardingList />} />
                      <Route path="/rm/onboarding/new" element={<NewClientPage />} />
                      <Route path="/rm/onboarding/:id" element={<ClientOnboardingPage />} />
                      <Route path="/rm/clients/:id/status" element={<RmClientStatusPage />} />
                      <Route
                        path="/rm/opportunities"
                        element={<WorkflowPage surface="Opportunities" compact />}
                      />
                      <Route
                        path="/rm/documents"
                        element={<Navigate to="/rm/communications" replace />}
                      />
                      <Route path="/rm/communications" element={<RmCommunications />} />
                      <Route path="/rm/opportunities/:id" element={<RmDeal />} />
                      <Route path="/rm/partners" element={<PartnerBookPage />} />
                      <Route path="/rm/partners/:firm" element={<PartnerPage />} />
                      <Route path="/rm/reports" element={<Navigate to="/rm" replace />} />
                      <Route
                        path="/rm/support"
                        element={<Navigate to="/rm/communications" replace />}
                      />
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
                      <Route path="/eam/support" element={<Navigate to="/eam" replace />} />
                      <Route path="/eam/reports" element={<EamReportsPage />} />
                      <Route path="/eam/revenue" element={<EamRevenuePage />} />
                      <Route path="/eam/profile" element={<EamProfilePage />} />
                    </Route>
                  </Route>
                </Route>
                <Route path="/dashboard" element={<Navigate to="/portfolio" replace />} />
                <Route
                  path="*"
                  element={
                    <main className="mx-auto max-w-xl space-y-4 p-8">
                      <h1 className="text-2xl font-semibold">Page not found</h1>
                      <p>This address does not match a page in the platform.</p>
                      <Link to="/" className="text-primary underline">
                        Return to the platform
                      </Link>
                    </main>
                  }
                />
              </SentryRoutes>
            </ActiveProfileProvider>
          </AuthProvider>
        </DemoRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
