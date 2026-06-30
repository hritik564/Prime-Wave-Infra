import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Layers, Loader2, ArrowLeftRight } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import WalletTabs from "@/components/wallet/WalletTabs";
import WalletHero from "@/components/wallet/WalletHero";
import TransferModule from "@/components/wallet/TransferModule";
import { getWallets, getWalletHistory, listTransfers, type Transaction, type IncomeTransfer } from "@/lib/api";

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function IncomeWalletPage() {
  const [incomeBalance, setIncomeBalance]         = useState(0);
  const [withdrawalBalance, setWithdrawalBalance] = useState(0);
  const [claims, setClaims]                       = useState<Transaction[]>([]);
  const [transfers, setTransfers]                 = useState<IncomeTransfer[]>([]);
  const [loading, setLoading]                     = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [wallets, history, txfResult] = await Promise.all([
        getWallets(),
        getWalletHistory({ limit: 20, wallet: "INCOME_WALLET" }),
        listTransfers({ limit: 20 }),
      ]);
      setIncomeBalance(parseFloat(wallets.incomeWallet));
      setWithdrawalBalance(parseFloat(wallets.withdrawalWallet));
      setClaims(history.data);
      setTransfers(txfResult.data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleTransferCreated = useCallback((newIncomeBalance: number) => {
    setIncomeBalance(newIncomeBalance);
    void loadData();
  }, [loadData]);

  const roiTotal = claims
    .filter((c) => c.type === "ROI_CLAIM")
    .reduce((s, c) => s + parseFloat(c.amount), 0);

  const principalTotal = claims
    .filter((c) => c.type === "PRINCIPAL_RELEASE")
    .reduce((s, c) => s + parseFloat(c.amount), 0);

  return (
    <AppLayout pageTitle="Wallets" notificationCount={0}>
      <PageContainer>
        <WalletTabs />

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
          </div>
        ) : (
          <>
            <WalletHero
              walletName="Income Wallet"
              balance={fmt(incomeBalance)}
              description="Accumulated ROI, bonuses, and matured principal"
              subMetrics={[
                { label: "ROI Claims",        value: fmt(roiTotal),          color: "#34d399" },
                { label: "Principal Claims",  value: fmt(principalTotal),    color: "#60a5fa" },
                { label: "Withdrawal Wallet", value: fmt(withdrawalBalance), color: "#c084fc" },
              ]}
            />

            {/* 72-hour Transfer Module */}
            <TransferModule
              availableBalance={incomeBalance}
              transfers={transfers}
              onTransferCreated={handleTransferCreated}
            />

            {/* Claims History */}
            <div>
              <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Claims History</h2>
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                }}
              >
                {claims.length === 0 ? (
                  <div className="py-12 flex flex-col items-center gap-3 text-center">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl"
                      style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)" }}
                    >
                      <ArrowLeftRight className="h-5 w-5" style={{ color: "rgba(212,175,55,0.5)" }} />
                    </div>
                    <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                      No claims yet. ROI credits appear here after each cycle.
                    </p>
                  </div>
                ) : (
                  claims.map((item, i) => {
                    const isRoi = item.type === "ROI_CLAIM";
                    const amount = parseFloat(item.amount);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: i < claims.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                          style={{ background: isRoi ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)" }}
                        >
                          {isRoi
                            ? <TrendingUp className="h-4 w-4" style={{ color: "#34d399" }} />
                            : <Layers    className="h-4 w-4" style={{ color: "#60a5fa" }} />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {isRoi ? "Daily ROI Credit" : "Principal Release"}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(170,179,197,0.5)" }}>
                            {item.description ?? (isRoi ? "ROI claim" : "Principal claim")} · {timeAgo(item.createdAt)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold font-mono shrink-0" style={{ color: "#34d399" }}>
                          +{fmt(amount)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </PageContainer>
    </AppLayout>
  );
}
