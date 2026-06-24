import { useState } from "react";
import { Copy, CheckCheck, ArrowDownToLine } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import WalletTabs from "@/components/wallet/WalletTabs";
import WalletHero from "@/components/wallet/WalletHero";
import { Badge } from "@/components/ui/badge";

interface DepositItem {
  id: number;
  amount: string;
  network: string;
  status: "approved" | "pending" | "rejected";
  date: string;
  txHash: string;
}

const history: DepositItem[] = [
  { id: 1, amount: "$7,500.00", network: "BEP20", status: "approved", date: "Jun 20, 2026", txHash: "0x3f2a...c8d1" },
  { id: 2, amount: "$5,000.00", network: "BEP20", status: "approved", date: "Jun 15, 2026", txHash: "0x1b4e...a7f2" },
  { id: 3, amount: "$2,500.00", network: "TRC20", status: "approved", date: "Jun 10, 2026", txHash: "0x9c3d...2e5b" },
  { id: 4, amount: "$1,000.00", network: "BEP20", status: "pending", date: "Jun 24, 2026", txHash: "0x7a8b...4f9c" },
  { id: 5, amount: "$500.00",  network: "TRC20", status: "rejected", date: "Jun 05, 2026", txHash: "0x2d6e...1a3c" },
];

const statusConfig = {
  approved: { label: "Approved", variant: "success" as const, color: "#34d399" },
  pending:  { label: "Pending",  variant: "warning" as const, color: "#fbbf24" },
  rejected: { label: "Rejected", variant: "destructive" as const, color: "#f87171" },
};

const DEPOSIT_ADDRESS = "0xA1b2C3d4E5f6A7b8C9d0E1f2A3b4C5d6E7f8A9b0";

function shorten(addr: string, front = 6, back = 4) {
  return `${addr.slice(0, front)}...${addr.slice(-back)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
      style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37" }}
      aria-label="Copy"
    >
      {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function DepositWalletPage() {
  return (
    <AppLayout pageTitle="Wallets" notificationCount={3}>
      <PageContainer>
        <WalletTabs />

        <WalletHero
          walletName="Deposit Wallet"
          balance="$15,000.00"
          description="Your principal investment balance across all active plans"
        />

        {/* Deposit Address Card */}
        <div
          className="rounded-2xl p-5 mb-5 lg:mb-6"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid rgba(212,175,55,0.2)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "hsl(var(--muted-foreground))" }}>
            Your Deposit Address
          </p>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(212,175,55,0.1)" }}
            >
              <ArrowDownToLine className="h-4 w-4" style={{ color: "#D4AF37" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm text-foreground truncate">{DEPOSIT_ADDRESS}</p>
              <p className="text-xs mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>BEP20 (BSC) Network</p>
            </div>
            <CopyButton text={DEPOSIT_ADDRESS} />
          </div>
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.15)", color: "#fbbf24" }}
          >
            ⚠ Send only BEP20 / TRC20 USDT. Other tokens will be lost.
          </div>
        </div>

        {/* History */}
        <div className="mb-2">
          <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Deposit History</h2>

          {/* Mobile: Cards */}
          <div className="md:hidden space-y-3">
            {history.map((item) => {
              const s = statusConfig[item.status];
              return (
                <div
                  key={item.id}
                  className="rounded-xl p-4"
                  style={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg font-bold font-heading" style={{ color: "#34d399" }}>
                      +{item.amount}
                    </span>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                    <span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{item.network}</span>
                    <span>{item.date}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs font-mono" style={{ color: "rgba(170,179,197,0.55)" }}>
                      Tx: {item.txHash}
                    </span>
                    <CopyButton text={item.txHash} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: Table */}
          <div
            className="hidden md:block rounded-2xl overflow-hidden"
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                  {["Amount", "Network", "Status", "Date", "Tx Hash"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((item, i) => {
                  const s = statusConfig[item.status];
                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: i < history.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                    >
                      <td className="px-5 py-4">
                        <span className="font-semibold font-mono" style={{ color: "#34d399" }}>
                          +{item.amount}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className="text-xs font-semibold px-2 py-1 rounded-md"
                          style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37" }}
                        >
                          {item.network}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="px-5 py-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {item.date}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs" style={{ color: "rgba(170,179,197,0.55)" }}>
                            {item.txHash}
                          </span>
                          <CopyButton text={item.txHash} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
