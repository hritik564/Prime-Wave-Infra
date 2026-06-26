import { Switch, Route, useLocation, Redirect } from "wouter";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import DashboardPage from "@/pages/DashboardPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";
import DepositWalletPage from "@/pages/wallet/DepositWalletPage";
import IncomeWalletPage from "@/pages/wallet/IncomeWalletPage";
import WithdrawalWalletPage from "@/pages/wallet/WithdrawalWalletPage";
import InvestmentsPage from "@/pages/investments/InvestmentsPage";
import InvestmentHistoryPage from "@/pages/investments/InvestmentHistoryPage";
import NetworkIntelligencePage from "@/pages/network/NetworkIntelligencePage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import DevToolsPage from "@/pages/DevToolsPage";
import IncomeCenterPage from "@/pages/income/IncomeCenterPage";
import { lazy, Suspense } from "react";
const AdminDashboardPage     = lazy(() => import("@/pages/admin/AdminDashboardPage"));
const AdminMembersPage       = lazy(() => import("@/pages/admin/MembersPage"));
const AdminInvestmentsPage   = lazy(() => import("@/pages/admin/InvestmentsPage"));
const AdminWithdrawalsPage   = lazy(() => import("@/pages/admin/WithdrawalsPage"));
const AdminWalletsPage       = lazy(() => import("@/pages/admin/WalletsPage"));
const AdminBinaryNetworkPage = lazy(() => import("@/pages/admin/BinaryNetworkPage"));
const AdminIncomeEnginePage  = lazy(() => import("@/pages/admin/IncomeEnginePage"));
const AdminPlansPage         = lazy(() => import("@/pages/admin/PlansPage"));
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import SectionHeader from "@/components/shared/SectionHeader";
import { Inbox } from "lucide-react";

function ComingSoon({ title }: { title: string }) {
  return (
    <AppLayout pageTitle={title} notificationCount={0}>
      <PageContainer>
        <SectionHeader title={title} />
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
            style={{
              background: "rgba(212, 175, 55, 0.08)",
              border: "1px solid rgba(212, 175, 55, 0.15)",
            }}
          >
            <Inbox className="h-8 w-8 text-gold" />
          </div>
          <h3 className="text-lg font-semibold font-heading text-foreground">
            Coming in a future sprint
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-xs">
            This page will be fully built out in subsequent sprints.
          </p>
        </div>
      </PageContainer>
    </AppLayout>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();

  if (!isAuthenticated) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      {/* ── Auth Routes (no AppLayout) ── */}
      <Route path="/login">
        <LoginPage />
      </Route>
      <Route path="/register">
        <RegisterPage />
      </Route>
      <Route path="/forgot-password">
        <ForgotPasswordPage />
      </Route>
      <Route path="/reset-password">
        <ResetPasswordPage />
      </Route>

      {/* ── Protected Platform Routes ── */}
      <Route path="/dashboard">
        <RequireAuth><DashboardPage /></RequireAuth>
      </Route>

      <Route path="/investments/history">
        <RequireAuth><InvestmentHistoryPage /></RequireAuth>
      </Route>
      <Route path="/investments">
        <RequireAuth><InvestmentsPage /></RequireAuth>
      </Route>

      <Route path="/wallets/deposit">
        <RequireAuth><DepositWalletPage /></RequireAuth>
      </Route>
      <Route path="/wallets/income">
        <RequireAuth><IncomeWalletPage /></RequireAuth>
      </Route>
      <Route path="/wallets/withdrawal">
        <RequireAuth><WithdrawalWalletPage /></RequireAuth>
      </Route>

      <Route path="/notifications">
        <RequireAuth><NotificationsPage /></RequireAuth>
      </Route>
      <Route path="/settings">
        <RequireAuth><SettingsPage /></RequireAuth>
      </Route>

      <Route path="/binary-tree">
        <Redirect to="/team" />
      </Route>
      <Route path="/network">
        <RequireAuth><NetworkIntelligencePage /></RequireAuth>
      </Route>
      <Route path="/team">
        <RequireAuth><NetworkIntelligencePage /></RequireAuth>
      </Route>
      <Route path="/income">
        <RequireAuth><IncomeCenterPage /></RequireAuth>
      </Route>
      {/* Legacy sub-routes redirect to Income Center */}
      <Route path="/income/binary">
        <Redirect to="/income" />
      </Route>
      <Route path="/income/orbit">
        <Redirect to="/income" />
      </Route>
      <Route path="/income/level">
        <Redirect to="/income" />
      </Route>
      <Route path="/income/salary">
        <Redirect to="/income" />
      </Route>

      {/* ── Admin Portal ── */}
      <Route path="/admin">
        <Suspense fallback={null}><AdminDashboardPage /></Suspense>
      </Route>
      <Route path="/admin/members">
        <Suspense fallback={null}><AdminMembersPage /></Suspense>
      </Route>
      <Route path="/admin/investments">
        <Suspense fallback={null}><AdminInvestmentsPage /></Suspense>
      </Route>
      <Route path="/admin/withdrawals">
        <Suspense fallback={null}><AdminWithdrawalsPage /></Suspense>
      </Route>
      <Route path="/admin/wallets">
        <Suspense fallback={null}><AdminWalletsPage /></Suspense>
      </Route>
      <Route path="/admin/binary">
        <Suspense fallback={null}><AdminBinaryNetworkPage /></Suspense>
      </Route>
      <Route path="/admin/income">
        <Suspense fallback={null}><AdminIncomeEnginePage /></Suspense>
      </Route>
      <Route path="/admin/plans">
        <Suspense fallback={null}><AdminPlansPage /></Suspense>
      </Route>
      <Route path="/admin/:rest*">
        <Suspense fallback={null}><AdminDashboardPage /></Suspense>
      </Route>

      {/* ── Dev Toolkit (dev only) ── */}
      <Route path="/dev-tools">
        <DevToolsPage />
      </Route>

      {/* ── Root + catch-all → login ── */}
      <Route>
        <LoginPage />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
