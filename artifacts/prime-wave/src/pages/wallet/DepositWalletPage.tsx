import { useState, useCallback, useEffect } from "react";
import { Copy, CheckCheck, ArrowDownToLine, Plus, CheckCircle2, Loader2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import WalletTabs from "@/components/wallet/WalletTabs";
import WalletHero from "@/components/wallet/WalletHero";
import { Badge } from "@/components/ui/badge";
import DepositModal from "@/components/deposits/DepositModal";
import { getWallets, getDepositHistory, type DepositRequest } from "@/lib/api";

const DEPOSIT_ADDRESS = "0xA1b2C3d4E5f6A7b8C9d0E1f2A3b4C5d6E7f8A9b0";

const statusConfig = {
  APPROVED: { label: "Approved", variant: "success"     as const, color: "#34d399" },
  PENDING:  { label: "Pending",  variant: "warning"     as const, color: "#fbbf24" },
  REJECTED: { label: "Rejected", variant: "destructive" as const, color: "#f87171" },
};

function fmt(amount: string) {
  const n = parseFloat(amount);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtBalance(amount: string) {
  const n = parseFloat(amount);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shorten(hash: string) {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
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

interface ToastItem { id: number; message: string }

export default function DepositWalletPage() {
  const [depositOpen, setDepositOpen] = useState(false);
  const [toasts, setToasts]           = useState<ToastItem[]>([]);
  const [balance, setBalance]         = useState<string | null>(null);
  const [deposits, setDeposits]       = useState<DepositRequest[]>([]);
  const [loading, setLoading]         = useState(true);

  const load = useCallback(async () => {
    try {
      const [walletData, historyData] = await Promise.all([
        getWallets(),
        getDepositHistory({ limit: 50 }),
      ]);
      setBalance(walletData.depositWallet);
      setDeposits(historyData.data);
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const handleDepositSuccess = useCallback((message: string) => {
    showToast(message);
    void load(); // refresh balance + history
  }, [showToast, load]);

  const displayBalance = loading ? "Loading…" : balance !== null ? fmtBalance(balance) : "$0.00";

  return (
    <AppLayout pageTitle="Wallets" notificationCount={3}>
      <PageContainer>
        <WalletTabs />

        <WalletHero
          walletName="Deposit Wallet"
          balance={displayBalance}
          description="Your principal investment balance across all active plans"
        />

        {/* New Deposit CTA */}
        <button
          onClick={() => setDepositOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-4 mb-5 lg:mb-6 font-semibold text-sm transition-all duration-200 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
            color: "#0E1B37",
            boxShadow: "0 4px 20px rgba(212,175,55,0.35)",
          }}
        >
          <Plus className="h-4 w-4" />
          New Deposit
        </button>

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

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : deposits.length === 0 ? (
            <div
              className="rounded-2xl p-8 text-center"
              style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            >
              <p className="text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>No deposits yet</p>
            </div>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-3">
                {deposits.map((dep) => {
                  const s = statusConfig[dep.status] ?? statusConfig.PENDING;
                  return (
                    <div
                      key={dep.id}
                      className="rounded-xl p-4"
                      style={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold font-heading" style={{ color: "#34d399" }}>
                          +{fmt(dep.amount)}
                        </span>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                        <span className="font-medium" style={{ color: "hsl(var(--foreground))" }}>{dep.network}</span>
                        <span>{fmtDate(dep.createdAt)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs font-mono truncate max-w-[160px]" style={{ color: "rgba(170,179,197,0.55)" }}>
                          Tx: {shorten(dep.txHash)}
                        </span>
                        <CopyButton text={dep.txHash} />
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
                    {deposits.map((dep, i) => {
                      const s = statusConfig[dep.status] ?? statusConfig.PENDING;
                      return (
                        <tr
                          key={dep.id}
                          className="transition-colors hover:bg-white/[0.02]"
                          style={{ borderBottom: i < deposits.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                        >
                          <td className="px-5 py-4">
                            <span className="font-semibold font-mono" style={{ color: "#34d399" }}>
                              +{fmt(dep.amount)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-xs font-semibold px-2 py-1 rounded-md" style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37" }}>
                              {dep.network}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <Badge variant={s.variant}>{s.label}</Badge>
                          </td>
                          <td className="px-5 py-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                            {fmtDate(dep.createdAt)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs truncate max-w-[140px]" style={{ color: "rgba(170,179,197,0.55)" }}>
                                {shorten(dep.txHash)}
                              </span>
                              <CopyButton text={dep.txHash} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </PageContainer>

      {depositOpen && (
        <DepositModal
          onClose={() => setDepositOpen(false)}
          onSuccess={handleDepositSuccess}
        />
      )}

      {/* Toast */}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-xl"
              style={{ background: "#0E1B37", border: "1px solid rgba(52,211,153,0.35)", color: "#34d399" }}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
