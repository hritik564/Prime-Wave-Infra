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
import NetworkTeamPage from "@/pages/network/NetworkTeamPage";
import NetworkBusinessHealthPage from "@/pages/network/NetworkBusinessHealthPage";
import NetworkForecastsPage from "@/pages/network/NetworkForecastsPage";
import NetworkActivityPage from "@/pages/network/NetworkActivityPage";
import NotificationsPage from "@/pages/notifications/NotificationsPage";
import SettingsPage from "@/pages/settings/SettingsPage";
import DevToolsPage from "@/pages/DevToolsPage";
import IncomeCenterPage from "@/pages/income/IncomeCenterPage";

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

      {/* ── Network Intelligence ── (sub-routes registered before parent) */}
      <Route path="/team/members">
        <RequireAuth><NetworkTeamPage /></RequireAuth>
      </Route>
      <Route path="/team/health">
        <RequireAuth><NetworkBusinessHealthPage /></RequireAuth>
      </Route>
      <Route path="/team/forecasts">
        <RequireAuth><NetworkForecastsPage /></RequireAuth>
      </Route>
      <Route path="/team/activity">
        <RequireAuth><NetworkActivityPage /></RequireAuth>
      </Route>
      <Route path="/team">
        <RequireAuth><NetworkIntelligencePage /></RequireAuth>
      </Route>
      {/* Legacy aliases */}
      <Route path="/binary-tree">
        <Redirect to="/team" />
      </Route>
      <Route path="/network">
        <Redirect to="/team" />
      </Route>

      <Route path="/income">
        <RequireAuth><IncomeCenterPage /></RequireAuth>
      </Route>
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
