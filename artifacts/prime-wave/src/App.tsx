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
import TeamPage from "@/pages/network/TeamPage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import DevToolsPage from "@/pages/DevToolsPage";
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
        <RequireAuth><ComingSoon title="Binary Tree" /></RequireAuth>
      </Route>
      <Route path="/network">
        <RequireAuth><TeamPage /></RequireAuth>
      </Route>
      <Route path="/team">
        <RequireAuth><TeamPage /></RequireAuth>
      </Route>
      <Route path="/income/binary">
        <RequireAuth><ComingSoon title="Binary Income" /></RequireAuth>
      </Route>
      <Route path="/income/orbit">
        <RequireAuth><ComingSoon title="Orbit Income" /></RequireAuth>
      </Route>
      <Route path="/income/level">
        <RequireAuth><ComingSoon title="Level Income" /></RequireAuth>
      </Route>
      <Route path="/income/salary">
        <RequireAuth><ComingSoon title="Salary Income" /></RequireAuth>
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
