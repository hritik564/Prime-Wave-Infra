import { useState, useEffect, useCallback } from "react";
import { ArrowUpFromLine, X, Wallet, Loader2, CheckCircle2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import WalletTabs from "@/components/wallet/WalletTabs";
import WalletHero from "@/components/wallet/WalletHero";
import { Badge } from "@/components/ui/badge";
import {
  getWallets,
  getWithdrawalHistory,
  createWithdrawal,
  type WithdrawalRequest,
} from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

const statusConfig = {
  PENDING:   { label: "Pending",   variant: "warning"     as const },
  APPROVED:  { label: "Approved",  variant: "success"     as const },
  COMPLETED: { label: "Completed", variant: "success"     as const },
  REJECTED:  { label: "Rejected",  variant: "destructive" as const },
  CANCELLED: { label: "Cancelled", variant: "secondary"   as const },
};

function fmt(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shorten(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

interface ToastItem { id: number; message: string; type: "success" | "error" }

interface WithdrawalModalProps {
  available: number;
  walletAddress: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

function WithdrawalModal({ available, walletAddress, onClose, onSuccess }: WithdrawalModalProps) {
  const [amount, setAmount]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const num      = parseFloat(amount) || 0;
  const minWith  = 50;
  const maxWith  = Math.min(500, available);
  const isValid  = num >= minWith && num <= maxWith && !submitting;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError(null);
    try {
      await createWithdrawal({ amount: num, walletAddress, network: "BEP20" });
      onSuccess(`Withdrawal of ${fmt(num)} submitted. Awaiting admin approval.`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 lg:p-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "hsl(var(--card))", border: "1px solid rgba(212,175,55,0.2)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(212,175,55,0.1)" }}>
              <ArrowUpFromLine className="h-4 w-4" style={{ color: "#D4AF37" }} />
            </div>
            <div>
              <p className="text-base font-semibold font-heading text-foreground">Request Withdrawal</p>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>BEP20 Network</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: "hsl(var(--muted-foreground))" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Wallet address */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "hsl(var(--muted-foreground))" }}>
              BEP20 Wallet Address
            </label>
            <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "hsl(var(--input))", border: "1px solid hsl(var(--border))" }}>
              <Wallet className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }} />
              <p className="flex-1 font-mono text-xs text-foreground truncate">{walletAddress || "No wallet address on file"}</p>
            </div>
            <p className="text-xs mt-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>
              Funds will be sent to your registered wallet. Update it in Settings.
            </p>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "hsl(var(--muted-foreground))" }}>
              Amount (USDT)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>$</span>
              <input
                type="number"
                min={minWith}
                max={maxWith}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl pl-8 pr-4 py-3.5 text-lg font-mono font-semibold text-foreground outline-none"
                style={{
                  background: "hsl(var(--input))",
                  border: `1px solid ${num > 0 && !isValid ? "rgba(248,113,113,0.5)" : num > 0 ? "rgba(212,175,55,0.3)" : "hsl(var(--border))"}`,
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>Min: ${minWith}</span>
              <span className="text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>Max: {fmt(maxWith)}</span>
            </div>
            {num > 0 && num < minWith && (
              <p className="text-xs mt-1" style={{ color: "#f87171" }}>Minimum withdrawal is ${minWith}</p>
            )}
            {num > maxWith && (
              <p className="text-xs mt-1" style={{ color: "#f87171" }}>Exceeds available balance ({fmt(maxWith)})</p>
            )}
          </div>

          {/* Available */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
            <span className="text-sm" style={{ color: "rgba(170,179,197,0.7)" }}>Available Balance</span>
            <span className="text-sm font-semibold font-mono" style={{ color: "#34d399" }}>{fmt(available)}</span>
          </div>

          {error && (
            <div className="rounded-lg px-3 py-2.5 text-xs" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="w-full rounded-xl py-3.5 font-semibold text-sm transition-all duration-200 min-h-[52px] flex items-center justify-center gap-2"
            style={
              isValid
                ? { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 16px rgba(212,175,55,0.3)" }
                : { background: "rgba(255,255,255,0.06)", color: "rgba(170,179,197,0.4)", cursor: submitting ? "default" : "not-allowed" }
            }
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ArrowUpFromLine className="h-4 w-4" /> Submit Withdrawal Request</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WithdrawalWalletPage() {
  const { user }                  = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [balance, setBalance]     = useState<number>(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toasts, setToasts]       = useState<ToastItem[]>([]);

  const load = useCallback(async () => {
    try {
      const [walletData, historyData] = await Promise.all([
        getWallets(),
        getWithdrawalHistory({ limit: 50 }),
      ]);
      setBalance(parseFloat(walletData.withdrawalWallet));
      setWithdrawals(historyData.data);
    } catch {
      // keep whatever we have
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const showToast = useCallback((message: string, type: ToastItem["type"] = "success") => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const handleSuccess = useCallback((msg: string) => {
    showToast(msg);
    void load();
  }, [showToast, load]);

  const walletAddress = (user as { walletAddress?: string } | null)?.walletAddress ?? "";

  return (
    <AppLayout pageTitle="Wallets" notificationCount={3}>
      <PageContainer>
        <WalletTabs />

        <WalletHero
          walletName="Withdrawal Wallet"
          balance={loading ? "Loading…" : fmt(balance)}
          description="Funds available for withdrawal to your BEP20 wallet"
        />

        <button
          onClick={() => setModalOpen(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-semibold text-sm mb-5 lg:mb-6 min-h-[56px] transition-all duration-200 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 20px rgba(212,175,55,0.35)" }}
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Request Withdrawal
        </button>

        {/* History */}
        <div>
          <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Withdrawal History</h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
              <ArrowUpFromLine className="h-8 w-8 mx-auto mb-3 opacity-30" style={{ color: "#D4AF37" }} />
              <p className="text-sm font-medium text-foreground">No withdrawals yet</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                Submit a withdrawal request to get started.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-3">
                {withdrawals.map((item) => {
                  const s = statusConfig[item.status] ?? statusConfig.PENDING;
                  return (
                    <div key={item.id} className="rounded-xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 2px 12px rgba(0,0,0,0.25)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold font-heading" style={{ color: "#f87171" }}>-{fmt(item.amount)}</span>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono" style={{ color: "rgba(170,179,197,0.55)" }}>{shorten(item.walletAddress)}</span>
                        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtDate(item.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: Table */}
              <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid hsl(var(--border))" }}>
                      {["Amount", "Status", "Network", "Wallet", "Date"].map((h) => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((item, i) => {
                      const s = statusConfig[item.status] ?? statusConfig.PENDING;
                      return (
                        <tr key={item.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderBottom: i < withdrawals.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <td className="px-5 py-4 font-semibold font-mono" style={{ color: "#f87171" }}>-{fmt(item.amount)}</td>
                          <td className="px-5 py-4"><Badge variant={s.variant}>{s.label}</Badge></td>
                          <td className="px-5 py-4 text-xs font-semibold" style={{ color: "#D4AF37" }}>{item.network}</td>
                          <td className="px-5 py-4 font-mono text-xs" style={{ color: "rgba(170,179,197,0.55)" }}>{shorten(item.walletAddress)}</td>
                          <td className="px-5 py-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtDate(item.createdAt)}</td>
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

      {modalOpen && (
        <WithdrawalModal
          available={balance}
          walletAddress={walletAddress}
          onClose={() => setModalOpen(false)}
          onSuccess={handleSuccess}
        />
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 pointer-events-none lg:bottom-6 lg:left-auto lg:right-6 lg:w-80">
          {toasts.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-xl"
              style={{
                background: "#0E1B37",
                border: `1px solid ${t.type === "error" ? "rgba(239,68,68,0.35)" : "rgba(52,211,153,0.35)"}`,
                color: t.type === "error" ? "#ef4444" : "#34d399",
              }}
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
