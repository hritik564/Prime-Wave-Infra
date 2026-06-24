import { useState } from "react";
import { ArrowUpFromLine, X, Copy, CheckCheck, Wallet } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import WalletTabs from "@/components/wallet/WalletTabs";
import WalletHero from "@/components/wallet/WalletHero";
import { Badge } from "@/components/ui/badge";

interface WithdrawalItem {
  id: number;
  amount: string;
  status: "pending" | "approved" | "completed" | "rejected" | "cancelled";
  date: string;
  wallet: string;
}

const history: WithdrawalItem[] = [
  { id: 1, amount: "$800.00",  status: "completed", date: "Jun 18, 2026", wallet: "0xA1b2...f8A9" },
  { id: 2, amount: "$350.00",  status: "approved",  date: "Jun 22, 2026", wallet: "0xA1b2...f8A9" },
  { id: 3, amount: "$1,200.00",status: "pending",   date: "Jun 24, 2026", wallet: "0xA1b2...f8A9" },
  { id: 4, amount: "$200.00",  status: "rejected",  date: "Jun 01, 2026", wallet: "0xA1b2...f8A9" },
  { id: 5, amount: "$500.00",  status: "cancelled", date: "May 28, 2026", wallet: "0xA1b2...f8A9" },
];

const statusConfig = {
  pending:   { label: "Pending",   variant: "warning"     as const, color: "#fbbf24" },
  approved:  { label: "Approved",  variant: "success"     as const, color: "#34d399" },
  completed: { label: "Completed", variant: "success"     as const, color: "#34d399" },
  rejected:  { label: "Rejected",  variant: "destructive" as const, color: "#f87171" },
  cancelled: { label: "Cancelled", variant: "secondary"   as const, color: "rgba(170,179,197,0.6)" },
};

const BEP20_ADDRESS = "0xA1b2C3d4E5f6A7b8C9d0E1f2A3b4C5d6E7f8A9b0";
const MIN_WITHDRAWAL = 50;
const MAX_WITHDRAWAL = 500;
const AVAILABLE = 500;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
      style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37" }}
    >
      {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function WithdrawalModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const num = parseFloat(amount) || 0;
  const isValid = num >= MIN_WITHDRAWAL && num <= Math.min(MAX_WITHDRAWAL, AVAILABLE);

  const handleSubmit = () => {
    if (!isValid) return;
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); onClose(); }, 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center p-4 lg:p-6"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "hsl(var(--card))",
          border: "1px solid rgba(212,175,55,0.2)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Modal Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "rgba(212,175,55,0.1)" }}>
              <ArrowUpFromLine className="h-4 w-4" style={{ color: "#D4AF37" }} />
            </div>
            <div>
              <p className="text-base font-semibold font-heading text-foreground">Request Withdrawal</p>
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>BEP20 Network</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Wallet Address (read-only) */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "hsl(var(--muted-foreground))" }}>
              BEP20 Wallet Address
            </label>
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: "hsl(var(--input))", border: "1px solid hsl(var(--border))" }}
            >
              <Wallet className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }} />
              <p className="flex-1 font-mono text-xs text-foreground truncate">{BEP20_ADDRESS}</p>
              <CopyButton text={BEP20_ADDRESS} />
            </div>
            <p className="text-xs mt-1.5" style={{ color: "rgba(170,179,197,0.5)" }}>
              Funds will be sent to your registered wallet. Contact support to change it.
            </p>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "hsl(var(--muted-foreground))" }}>
              Amount (USDT)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: "hsl(var(--muted-foreground))" }}>
                $
              </span>
              <input
                type="number"
                min={MIN_WITHDRAWAL}
                max={Math.min(MAX_WITHDRAWAL, AVAILABLE)}
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
              <span className="text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>
                Min: ${MIN_WITHDRAWAL}
              </span>
              <span className="text-xs" style={{ color: "rgba(170,179,197,0.5)" }}>
                Max: ${Math.min(MAX_WITHDRAWAL, AVAILABLE)}
              </span>
            </div>
            {num > 0 && num < MIN_WITHDRAWAL && (
              <p className="text-xs mt-1" style={{ color: "#f87171" }}>Minimum withdrawal is ${MIN_WITHDRAWAL}</p>
            )}
            {num > Math.min(MAX_WITHDRAWAL, AVAILABLE) && (
              <p className="text-xs mt-1" style={{ color: "#f87171" }}>Maximum withdrawal is ${Math.min(MAX_WITHDRAWAL, AVAILABLE)}</p>
            )}
          </div>

          {/* Available balance */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}
          >
            <span className="text-sm" style={{ color: "rgba(170,179,197,0.7)" }}>Available Balance</span>
            <span className="text-sm font-semibold font-mono" style={{ color: "#34d399" }}>${AVAILABLE.toFixed(2)}</span>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitted}
            className="w-full rounded-xl py-3.5 font-semibold text-sm transition-all duration-200 min-h-[52px] flex items-center justify-center gap-2"
            style={
              isValid && !submitted
                ? { background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 16px rgba(212,175,55,0.3)" }
                : { background: "rgba(255,255,255,0.06)", color: "rgba(170,179,197,0.4)", cursor: "not-allowed" }
            }
          >
            {submitted ? (
              <>✓ Withdrawal Submitted</>
            ) : (
              <><ArrowUpFromLine className="h-4 w-4" /> Submit Withdrawal Request</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WithdrawalWalletPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <AppLayout pageTitle="Wallets" notificationCount={3}>
      <PageContainer>
        <WalletTabs />

        <WalletHero
          walletName="Withdrawal Wallet"
          balance="$500.00"
          description="Funds available for withdrawal to your BEP20 wallet"
          subMetrics={[
            { label: "Available",  value: "$500.00", color: "#34d399" },
            { label: "Locked",     value: "$0.00",   color: "rgba(170,179,197,0.6)" },
            { label: "Total",      value: "$500.00", color: "#D4AF37" },
          ]}
        />

        {/* Request Withdrawal CTA */}
        <button
          onClick={() => setModalOpen(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-semibold text-sm mb-5 lg:mb-6 min-h-[56px] transition-all duration-200 active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
            color: "#0E1B37",
            boxShadow: "0 4px 20px rgba(212,175,55,0.35)",
          }}
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Request Withdrawal
        </button>

        {/* History */}
        <div>
          <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Withdrawal History</h2>

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
                    <span className="text-lg font-bold font-heading" style={{ color: "#f87171" }}>
                      -{item.amount}
                    </span>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono" style={{ color: "rgba(170,179,197,0.55)" }}>
                      {item.wallet}
                    </span>
                    <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
                      {item.date}
                    </span>
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
                  {["Amount", "Status", "Wallet", "Date"].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(var(--muted-foreground))" }}>
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
                        <span className="font-semibold font-mono" style={{ color: "#f87171" }}>
                          -{item.amount}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs" style={{ color: "rgba(170,179,197,0.55)" }}>
                        {item.wallet}
                      </td>
                      <td className="px-5 py-4 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {item.date}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </PageContainer>

      {/* Withdrawal Modal */}
      {modalOpen && <WithdrawalModal onClose={() => setModalOpen(false)} />}
    </AppLayout>
  );
}
