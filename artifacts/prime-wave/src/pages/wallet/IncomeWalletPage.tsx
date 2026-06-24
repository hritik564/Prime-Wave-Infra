import { useState } from "react";
import { TrendingUp, RefreshCw, Layers } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import WalletTabs from "@/components/wallet/WalletTabs";
import WalletHero from "@/components/wallet/WalletHero";
import TransferModule from "@/components/wallet/TransferModule";

const BALANCE = 1280.75;

interface ClaimItem {
  type: "roi" | "principal";
  amount: string;
  description: string;
  date: string;
}

const claims: ClaimItem[] = [
  { type: "roi",       amount: "+$36.25",  description: "Elite Growth daily ROI",   date: "Today" },
  { type: "roi",       amount: "+$36.25",  description: "Elite Growth daily ROI",   date: "Yesterday" },
  { type: "roi",       amount: "+$36.25",  description: "Prime Orbit daily ROI",    date: "Jun 22, 2026" },
  { type: "principal", amount: "+$444.25", description: "Starter Pack matured",     date: "Jun 10, 2026" },
  { type: "roi",       amount: "+$36.25",  description: "Apex Binary daily ROI",    date: "Jun 20, 2026" },
];

export default function IncomeWalletPage() {
  const [autoCompound, setAutoCompound] = useState(true);

  return (
    <AppLayout pageTitle="Wallets" notificationCount={3}>
      <PageContainer>
        <WalletTabs />

        <WalletHero
          walletName="Income Wallet"
          balance={`$${BALANCE.toFixed(2)}`}
          description="Accumulated ROI, bonuses, and matured principal"
          subMetrics={[
            { label: "ROI Claims",       value: "$836.50",  color: "#34d399" },
            { label: "Principal Claims", value: "$444.25",  color: "#60a5fa" },
            { label: "Auto Compound",    value: autoCompound ? "ON" : "OFF", color: autoCompound ? "#D4AF37" : "rgba(170,179,197,0.6)" },
          ]}
        />

        {/* Auto Compound Toggle */}
        <div
          className="rounded-2xl p-5 mb-5 lg:mb-6"
          style={{
            background: "hsl(var(--card))",
            border: `1px solid ${autoCompound ? "rgba(212,175,55,0.25)" : "hsl(var(--border))"}`,
            boxShadow: autoCompound ? "0 0 0 1px rgba(212,175,55,0.08), 0 4px 24px rgba(0,0,0,0.3)" : "0 4px 24px rgba(0,0,0,0.3)",
            transition: "border-color 0.3s, box-shadow 0.3s",
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300"
              style={{
                background: autoCompound ? "rgba(212,175,55,0.12)" : "rgba(255,255,255,0.05)",
              }}
            >
              <RefreshCw className="h-5 w-5" style={{ color: autoCompound ? "#D4AF37" : "rgba(170,179,197,0.5)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-base font-semibold font-heading text-foreground">Auto Compound</p>
                  <p className="text-sm mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Reinvest daily ROI automatically
                  </p>
                </div>
                {/* Toggle */}
                <button
                  onClick={() => setAutoCompound((v) => !v)}
                  className="relative shrink-0 h-7 w-12 rounded-full transition-all duration-300"
                  style={{
                    background: autoCompound
                      ? "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)"
                      : "rgba(255,255,255,0.1)",
                    boxShadow: autoCompound ? "0 0 12px rgba(212,175,55,0.4)" : "none",
                  }}
                  aria-label="Toggle auto compound"
                >
                  <span
                    className="absolute top-0.5 h-6 w-6 rounded-full transition-all duration-300 shadow-sm"
                    style={{
                      background: "#fff",
                      left: autoCompound ? "calc(100% - 26px)" : "2px",
                    }}
                  />
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: "rgba(170,179,197,0.55)" }}>
                {autoCompound
                  ? "Daily ROI is being reinvested into your Deposit Wallet to compound your returns."
                  : "Daily ROI accumulates in this wallet. Toggle ON to start compounding."}
              </p>
            </div>
          </div>
        </div>

        {/* Transfer Module */}
        <TransferModule availableBalance={BALANCE} />

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
            {claims.map((item, i) => {
              const isRoi = item.type === "roi";
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                  style={{ borderBottom: i < claims.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background: isRoi ? "rgba(52,211,153,0.1)" : "rgba(96,165,250,0.1)",
                    }}
                  >
                    {isRoi
                      ? <TrendingUp className="h-4 w-4" style={{ color: "#34d399" }} />
                      : <Layers className="h-4 w-4" style={{ color: "#60a5fa" }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.description}</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(170,179,197,0.5)" }}>{item.date}</p>
                  </div>
                  <span className="text-sm font-semibold font-mono shrink-0" style={{ color: "#34d399" }}>
                    {item.amount}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
