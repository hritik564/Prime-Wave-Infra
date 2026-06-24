import { Switch, Route } from "wouter";
import { ThemeProvider } from "@/providers/ThemeProvider";
import DashboardPage from "@/pages/DashboardPage";
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
            This page is part of the design system and will be fully built out in subsequent sprints.
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
        <Route path="/dashboard">
          <DashboardPage />
        </Route>
        <Route path="/investments">
          <ComingSoon title="Investments" />
        </Route>
        <Route path="/wallets/deposit">
          <ComingSoon title="Deposit Wallet" />
        </Route>
        <Route path="/wallets/income">
          <ComingSoon title="Income Wallet" />
        </Route>
        <Route path="/wallets/withdrawal">
          <ComingSoon title="Withdrawal Wallet" />
        </Route>
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
        {/* Root and catch-all — must be last */}
        <Route>
          <DashboardPage />
        </Route>
      </Switch>
    </ThemeProvider>
  );
}
