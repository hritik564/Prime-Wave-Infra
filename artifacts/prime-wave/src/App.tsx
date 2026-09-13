import { Switch, Route, useLocation, Redirect } from "wouter";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import AccessDeniedPage from "@/pages/auth/AccessDeniedPage";
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
import IncomeDetailPage from "@/pages/income/IncomeDetailPage";
import SalaryCenterPage from "@/pages/salary/SalaryCenterPage";
import FinancialTransparencyPage from "@/pages/income/FinancialTransparencyPage";
import { lazy, Suspense } from "react";
const AdminDashboardPage     = lazy(() => import("@/pages/admin/AdminDashboardPage"));
const AdminMembersPage       = lazy(() => import("@/pages/admin/MembersPage"));
const AdminInvestmentsPage   = lazy(() => import("@/pages/admin/InvestmentsPage"));
const AdminDepositsPage      = lazy(() => import("@/pages/admin/DepositsPage"));
const AdminWithdrawalsPage   = lazy(() => import("@/pages/admin/WithdrawalsPage"));
const AdminWalletsPage       = lazy(() => import("@/pages/admin/WalletsPage"));
const AdminBinaryNetworkPage = lazy(() => import("@/pages/admin/BinaryNetworkPage"));
const AdminIncomeEnginePage  = lazy(() => import("@/pages/admin/IncomeEnginePage"));
const AdminPlansPage         = lazy(() => import("@/pages/admin/PlansPage"));
const AdminOperationsPage    = lazy(() => import("@/pages/admin/OperationsPage"));
const AdminSettingsPage      = lazy(() => import("@/pages/admin/AdminSettingsPage"));
const AdminAutoDepositsPage  = lazy(() => import("@/pages/admin/AutoDepositsPage"));
const AdminManualCreditPage      = lazy(() => import("@/pages/admin/ManualCreditPage"));
const AdminWithdrawalQueuePage   = lazy(() => import("@/pages/admin/WithdrawalQueuePage"));
const AdminWithdrawalOpsPage     = lazy(() => import("@/pages/admin/WithdrawalOperationalHealthPage"));
const AdminBlockchainHealthPage  = lazy(() => import("@/pages/admin/BlockchainHealthPage"));
const AdminBlockchainTesterPage  = lazy(() => import("@/pages/admin/BlockchainTesterPage"));
const AdminTreasuryPage          = lazy(() => import("@/pages/admin/TreasuryIntegrityPage"));
const AdminSalaryPage            = lazy(() => import("@/pages/admin/AdminSalaryManagementPage"));
const AdminPowerBusinessPage     = lazy(() => import("@/pages/admin/AdminPowerBusinessPage"));
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import SectionHeader from "@/components/shared/SectionHeader";
import { Inbox } from "lucide-react";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import PublicHomePage from "@/pages/public/PublicHomePage";
import PublicPage from "@/pages/public/PublicPage";

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

function RequireMember({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const [location] = useLocation();

  if (!isAuthenticated) {
    return <Redirect to={`/login?redirect=${encodeURIComponent(location)}`} />;
  }
  if (isAdmin) {
    return <Redirect to="/admin" />;
  }
  return <>{children}</>;
}

function RequireAdmin({ children, permission }: { children: React.ReactNode; permission?: Permission }) {
  const { isAuthenticated, isAdmin, hasPermission } = useAuth();

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }
  if (!isAdmin || (permission !== undefined && !hasPermission(permission))) {
    return <Redirect to="/access-denied" />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      {/* ── PrimeWave public website ── */}
      <Route path="/"><PublicHomePage /></Route>
      <Route path="/chain"><PublicPage kind="chain" /></Route>
      <Route path="/dex"><PublicPage kind="dex" /></Route>
      <Route path="/swap"><PublicPage kind="swap" /></Route>
      <Route path="/wallet"><PublicPage kind="wallet" /></Route>
      <Route path="/developers"><PublicPage kind="developers" /></Route>
      <Route path="/network"><PublicPage kind="network" /></Route>
      <Route path="/security"><PublicPage kind="security" /></Route>
      <Route path="/ecosystem"><PublicPage kind="ecosystem" /></Route>
      <Route path="/about"><PublicPage kind="about" /></Route>

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

      {/* ── Protected Platform Routes (members only) ── */}
      <Route path="/dashboard">
        <RequireMember><DashboardPage /></RequireMember>
      </Route>

      <Route path="/investments/history">
        <RequireMember><InvestmentHistoryPage /></RequireMember>
      </Route>
      <Route path="/investments">
        <RequireMember><InvestmentsPage /></RequireMember>
      </Route>

      <Route path="/wallets/deposit">
        <RequireMember><DepositWalletPage /></RequireMember>
      </Route>
      <Route path="/wallets/income">
        <RequireMember><IncomeWalletPage /></RequireMember>
      </Route>
      <Route path="/wallets/withdrawal">
        <RequireMember><WithdrawalWalletPage /></RequireMember>
      </Route>

      <Route path="/notifications">
        <RequireMember><NotificationsPage /></RequireMember>
      </Route>
      <Route path="/settings">
        <RequireMember><SettingsPage /></RequireMember>
      </Route>

      <Route path="/binary-tree">
        <Redirect to="/team" />
      </Route>
      <Route path="/team">
        <RequireMember><NetworkIntelligencePage /></RequireMember>
      </Route>
      <Route path="/income">
        <RequireMember><IncomeCenterPage /></RequireMember>
      </Route>
      <Route path="/transparency">
        <RequireMember><FinancialTransparencyPage /></RequireMember>
      </Route>
      {/* Income engine detail pages (Sprint 26B placeholder) */}
      <Route path="/income/roi">
        <RequireMember><IncomeDetailPage engine="roi" /></RequireMember>
      </Route>
      <Route path="/income/binary">
        <RequireMember><IncomeDetailPage engine="binary" /></RequireMember>
      </Route>
      <Route path="/income/orbit">
        <RequireMember><IncomeDetailPage engine="orbit" /></RequireMember>
      </Route>
      <Route path="/income/salary">
        <RequireMember><SalaryCenterPage /></RequireMember>
      </Route>
      <Route path="/income/level">
        <RequireMember><IncomeDetailPage engine="level" /></RequireMember>
      </Route>

      {/* ── Access Denied ── */}
      <Route path="/access-denied">
        <AccessDeniedPage />
      </Route>

      {/* ── Admin Portal (admins only) ── */}
      <Route path="/admin">
        <RequireAdmin permission={PERMISSIONS.VIEW_DASHBOARD}><Suspense fallback={null}><AdminDashboardPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/settings">
        <RequireAdmin><Suspense fallback={null}><AdminSettingsPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/members">
        <RequireAdmin permission={PERMISSIONS.VIEW_MEMBERS}><Suspense fallback={null}><AdminMembersPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/investments">
        <RequireAdmin permission={PERMISSIONS.VIEW_INVESTMENTS}><Suspense fallback={null}><AdminInvestmentsPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/deposits">
        <RequireAdmin permission={PERMISSIONS.VIEW_DEPOSITS}><Suspense fallback={null}><AdminDepositsPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/auto-deposits">
        <RequireAdmin permission={PERMISSIONS.VIEW_AUTO_DEPOSITS}><Suspense fallback={null}><AdminAutoDepositsPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/manual-credit">
        <RequireAdmin permission={PERMISSIONS.MANAGE_MANUAL_DEPOSIT}><Suspense fallback={null}><AdminManualCreditPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/withdrawals">
        <RequireAdmin permission={PERMISSIONS.VIEW_WITHDRAWALS}><Suspense fallback={null}><AdminWithdrawalsPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/withdrawal-queue">
        <RequireAdmin permission={PERMISSIONS.VIEW_WITHDRAWAL_QUEUE}><Suspense fallback={null}><AdminWithdrawalQueuePage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/withdrawal-ops">
        <RequireAdmin permission={PERMISSIONS.VIEW_WITHDRAWAL_OPS}><Suspense fallback={null}><AdminWithdrawalOpsPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/wallets">
        <RequireAdmin permission={PERMISSIONS.VIEW_WALLETS}><Suspense fallback={null}><AdminWalletsPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/binary">
        <RequireAdmin permission={PERMISSIONS.VIEW_BINARY}><Suspense fallback={null}><AdminBinaryNetworkPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/income">
        <RequireAdmin permission={PERMISSIONS.MANAGE_INCOME_ENGINE}><Suspense fallback={null}><AdminIncomeEnginePage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/power-business">
        <RequireAdmin permission={PERMISSIONS.VIEW_POWER_BUSINESS}><Suspense fallback={null}><AdminPowerBusinessPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/plans">
        <RequireAdmin permission={PERMISSIONS.MANAGE_CONFIGURATION}><Suspense fallback={null}><AdminPlansPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/reports">
        <RequireAdmin permission={PERMISSIONS.VIEW_REPORTS}><Suspense fallback={null}><AdminOperationsPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/blockchain-health">
        <RequireAdmin permission={PERMISSIONS.VIEW_BLOCKCHAIN}><Suspense fallback={null}><AdminBlockchainHealthPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/blockchain-tester">
        <RequireAdmin permission={PERMISSIONS.VIEW_BLOCKCHAIN}><Suspense fallback={null}><AdminBlockchainTesterPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/treasury">
        <RequireAdmin permission={PERMISSIONS.VIEW_TREASURY}><Suspense fallback={null}><AdminTreasuryPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/salary">
        <RequireAdmin permission={PERMISSIONS.VIEW_SALARY}><Suspense fallback={null}><AdminSalaryPage /></Suspense></RequireAdmin>
      </Route>
      <Route path="/admin/:rest*">
        <Redirect to="/access-denied" />
      </Route>

      {/* ── Dev Toolkit (dev only) ── */}
      <Route path="/dev-tools">
        <RequireAdmin permission={PERMISSIONS.MANAGE_DEV_TOOLS}><DevToolsPage /></RequireAdmin>
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
