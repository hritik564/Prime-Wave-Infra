import { Switch, Route } from "wouter";
import { ThemeProvider } from "@/providers/ThemeProvider";
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
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import SectionHeader from "@/components/shared/SectionHeader";
import { Inbox } from "lucide-react";

function ComingSoon({ title }: { title: string }) {
  return (
    <AppLayout pageTitle={title} notificationCount={3}>
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

export default function App() {
  return (
    <ThemeProvider>
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

        {/* ── Dashboard ── */}
        <Route path="/dashboard">
          <DashboardPage />
        </Route>

        {/* ── Investment Pages ── */}
        <Route path="/investments/history">
          <InvestmentHistoryPage />
        </Route>
        <Route path="/investments">
          <InvestmentsPage />
        </Route>

        {/* ── Wallet Pages ── */}
        <Route path="/wallets/deposit">
          <DepositWalletPage />
        </Route>
        <Route path="/wallets/income">
          <IncomeWalletPage />
        </Route>
        <Route path="/wallets/withdrawal">
          <WithdrawalWalletPage />
        </Route>

        {/* ── Coming Soon ── */}
        <Route path="/binary-tree">
          <ComingSoon title="Binary Tree" />
        </Route>
        <Route path="/team">
          <ComingSoon title="Team" />
        </Route>
        <Route path="/income/binary">
          <ComingSoon title="Binary Income" />
        </Route>
        <Route path="/income/orbit">
          <ComingSoon title="Orbit Income" />
        </Route>
        <Route path="/income/level">
          <ComingSoon title="Level Income" />
        </Route>
        <Route path="/income/salary">
          <ComingSoon title="Salary Income" />
        </Route>
        <Route path="/notifications">
          <ComingSoon title="Notifications" />
        </Route>
        <Route path="/settings">
          <ComingSoon title="Settings" />
        </Route>

        {/* ── Root + catch-all ── */}
        <Route>
          <LoginPage />
        </Route>
      </Switch>
    </ThemeProvider>
  );
}
