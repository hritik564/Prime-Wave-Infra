import { useState, useEffect, useCallback } from "react";
import {
  ArrowUpFromLine, X, Wallet, Loader2, CheckCircle2,
  GitMerge, RefreshCw, Users, DollarSign, ArrowLeftRight,
  TrendingUp, Layers, HelpCircle, Plus, Trash2, Star,
  Lock, ExternalLink, Copy, CheckCheck,
} from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import PageContainer from "@/components/shared/PageContainer";
import WalletTabs from "@/components/wallet/WalletTabs";
import WalletHero from "@/components/wallet/WalletHero";
import { Badge } from "@/components/ui/badge";
import {
  getWallets,
  getWalletHistory,
  getWithdrawalHistory,
  createWithdrawal,
  getWithdrawalSettings,
  listWalletAddresses,
  addWalletAddress,
  deleteWalletAddress,
  setPrimaryWalletAddress,
  type Transaction,
  type WithdrawalRequest,
  type WalletAddress,
} from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

// ── Type display config ────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  label: string;
  color: string;
  bg: string;
  Icon: React.ElementType;
  credit: boolean;
}> = {
  BINARY_MATCH:      { label: "Binary Matching",  color: "#D4AF37", bg: "rgba(212,175,55,0.1)",  Icon: GitMerge,        credit: true  },
  BINARY_ORBIT:      { label: "Binary Orbit",     color: "#a78bfa", bg: "rgba(167,139,250,0.1)", Icon: RefreshCw,       credit: true  },
  LEVEL_INCOME:      { label: "Level Income",     color: "#34d399", bg: "rgba(52,211,153,0.1)",  Icon: Users,           credit: true  },
  SALARY:            { label: "Salary Payout",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  Icon: DollarSign,      credit: true  },
  INCOME_TRANSFER:   { label: "Income Transfer",  color: "#fb923c", bg: "rgba(251,146,60,0.1)",  Icon: ArrowLeftRight,  credit: true  },
  ROI_CLAIM:         { label: "ROI Claim",        color: "#34d399", bg: "rgba(52,211,153,0.1)",  Icon: TrendingUp,      credit: true  },
  PRINCIPAL_RELEASE: { label: "Principal",        color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  Icon: Layers,          credit: true  },
  WITHDRAWAL:        { label: "Withdrawal",       color: "#f87171", bg: "rgba(248,113,113,0.1)", Icon: ArrowUpFromLine, credit: false },
};

const STATUS_CONFIG: Record<string, { label: string; variant: "warning" | "success" | "destructive" | "secondary" }> = {
  PENDING:     { label: "Pending",     variant: "warning"     },
  VALIDATING:  { label: "Validating",  variant: "warning"     },
  QUEUED:      { label: "Queued",      variant: "warning"     },
  PROCESSING:  { label: "Processing",  variant: "warning"     },
  BROADCASTING:{ label: "Broadcasting",variant: "warning"     },
  CONFIRMING:  { label: "Confirming",  variant: "warning"     },
  APPROVED:    { label: "Approved",    variant: "success"     },
  COMPLETED:   { label: "Completed",   variant: "success"     },
  FAILED:      { label: "Failed",      variant: "destructive" },
  REJECTED:    { label: "Rejected",    variant: "destructive" },
  CANCELLED:   { label: "Cancelled",   variant: "secondary"   },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return fmtDate(dateStr);
}

function shorten(addr: string) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

interface ToastItem { id: number; message: string; type: "success" | "error" }

// ── Hold Period Countdown ──────────────────────────────────────────────────────

function HoldCountdown({ requestedAt, holdMinutes }: { requestedAt: string; holdMinutes: number }) {
  const getRemaining = () => {
    const expiry = new Date(requestedAt).getTime() + holdMinutes * 60 * 1_000;
    return Math.max(0, expiry - Date.now());
  };

  const [remaining, setRemaining] = useState(getRemaining);

  useEffect(() => {
    if (remaining === 0) return;
    const timer = setInterval(() => {
      const r = getRemaining();
      setRemaining(r);
      if (r === 0) clearInterval(timer);
    }, 1_000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedAt, holdMinutes]);

  if (remaining === 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="success">Eligible for Processing</Badge>
      </div>
    );
  }

  const totalSec = Math.floor(remaining / 1_000);
  const h = Math.floor(totalSec / 3600).toString().padStart(2, "0");
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, "0");
  const s = (totalSec % 60).toString().padStart(2, "0");

  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="warning">Hold Period</Badge>
      <span className="font-mono text-[10px]" style={{ color: "#fbbf24" }}>{h}:{m}:{s} remaining</span>
    </div>
  );
}

// ── Explorer Link ──────────────────────────────────────────────────────────────

function ExplorerLink({ txHash, network }: { txHash: string; network: string }) {
  const [copied, setCopied] = useState(false);
  const url = network === "BEP20" ? `https://bscscan.com/tx/${txHash}` : null;
  const short = `${txHash.slice(0, 8)}…${txHash.slice(-6)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(txHash).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[10px] truncate max-w-[120px]" style={{ color: "rgba(170,179,197,0.55)" }}>{short}</span>
        <button onClick={handleCopy} className="shrink-0" title="Copy TX hash">
          {copied
            ? <CheckCheck className="h-3 w-3" style={{ color: "#34d399" }} />
            : <Copy className="h-3 w-3" style={{ color: "rgba(170,179,197,0.4)" }} />
          }
        </button>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] hover:underline"
          style={{ color: "#60a5fa" }}
        >
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          View on BscScan
        </a>
      )}
    </div>
  );
}

// ── Withdrawal Modal ───────────────────────────────────────────────────────────

interface WithdrawalModalProps {
  available:       number;
  addresses:       WalletAddress[];
  onClose:         () => void;
  onSuccess:       (msg: string) => void;
}

function WithdrawalModal({ available, addresses, onClose, onSuccess }: WithdrawalModalProps) {
  const verified     = addresses.filter((a) => a.isVerified);
  const primaryAddr  = verified.find((a) => a.isPrimary) ?? verified[0] ?? null;

  const [selectedAddr, setSelectedAddr] = useState<WalletAddress | null>(primaryAddr);
  const [amount, setAmount]             = useState("");
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [minWith, setMinWith]           = useState(1);
  const [settingsMax, setSettingsMax]   = useState(2500);

  useEffect(() => {
    getWithdrawalSettings()
      .then((s) => {
        setMinWith(parseFloat(s.minimumAmount));
        setSettingsMax(parseFloat(s.maximumAmount));
      })
      .catch(() => {});
  }, []);

  const num     = parseFloat(amount) || 0;
  const maxWith = Math.min(settingsMax, available);
  const isValid = num >= minWith && num <= maxWith && !!selectedAddr && !submitting;

  const handleSubmit = async () => {
    if (!isValid || !selectedAddr) return;
    setSubmitting(true);
    setError(null);
    try {
      await createWithdrawal({ amount: num, walletAddress: selectedAddr.address, network: "BEP20" });
      onSuccess(`Withdrawal of ${fmt(num)} submitted successfully.`);
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
              <p className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>BEP20 Network · USDT</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ color: "hsl(var(--muted-foreground))" }}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest mb-2 block" style={{ color: "hsl(var(--muted-foreground))" }}>
              Send To (BEP20 Address)
            </label>
            {verified.length === 0 ? (
              <div className="rounded-xl px-4 py-3 text-xs" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", color: "#ef4444" }}>
                No verified wallet addresses on file. Add one below before withdrawing.
              </div>
            ) : verified.length === 1 ? (
              <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "hsl(var(--input))", border: "1px solid hsl(var(--border))" }}>
                <Wallet className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }} />
                <p className="flex-1 font-mono text-xs text-foreground truncate">{verified[0].address}</p>
              </div>
            ) : (
              <select
                value={selectedAddr?.id ?? ""}
                onChange={(e) => setSelectedAddr(verified.find((a) => a.id === e.target.value) ?? null)}
                className="w-full rounded-xl px-4 py-3 text-sm font-mono text-foreground outline-none"
                style={{ background: "hsl(var(--input))", border: "1px solid hsl(var(--border))" }}
              >
                {verified.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label ? `${a.label} — ` : ""}{a.address.slice(0, 10)}…{a.address.slice(-6)}
                    {a.isPrimary ? " (Primary)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

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

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function WithdrawalWalletPage() {
  const { user: _user }           = useAuth();
  const [modalOpen, setModalOpen]   = useState(false);
  const [holdMinutes, setHoldMinutes] = useState(2);
  const [balance, setBalance]       = useState<number>(0);
  const [txHistory, setTxHistory] = useState<Transaction[]>([]);
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([]);
  const [walletAddresses, setWalletAddresses]       = useState<WalletAddress[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toasts, setToasts]       = useState<ToastItem[]>([]);
  const [addAddrOpen, setAddAddrOpen]   = useState(false);
  const [newAddr, setNewAddr]           = useState("");
  const [newLabel, setNewLabel]         = useState("");
  const [addingAddr, setAddingAddr]     = useState(false);
  const [addrError, setAddrError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [walletData, txData, wrData, addrData, settings] = await Promise.all([
        getWallets(),
        getWalletHistory({ limit: 50, wallet: "WITHDRAWAL_WALLET" }),
        getWithdrawalHistory({ limit: 50 }),
        listWalletAddresses("BEP20"),
        getWithdrawalSettings(),
      ]);
      setBalance(parseFloat(walletData.withdrawalWallet));
      setTxHistory(txData.data);
      setWithdrawalRequests(wrData.data);
      setWalletAddresses(addrData);
      setHoldMinutes(settings.holdMinutes);
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

  const handleAddAddress = async () => {
    if (!newAddr.trim()) return;
    setAddingAddr(true);
    setAddrError(null);
    try {
      await addWalletAddress({ network: "BEP20", address: newAddr.trim(), label: newLabel.trim() || undefined });
      showToast("Wallet address added", "success");
      setNewAddr("");
      setNewLabel("");
      setAddAddrOpen(false);
      await load();
    } catch (err: unknown) {
      setAddrError(err instanceof Error ? err.message : "Failed to add address");
    } finally {
      setAddingAddr(false);
    }
  };

  const handleDeleteAddress = async (id: string) => {
    try {
      await deleteWalletAddress(id);
      showToast("Address removed", "success");
      await load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to remove address", "error");
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      await setPrimaryWalletAddress(id);
      showToast("Primary address updated", "success");
      await load();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to update primary", "error");
    }
  };

  return (
    <AppLayout pageTitle="Wallets" notificationCount={3}>
      <PageContainer>
        <WalletTabs />

        <WalletHero
          walletName="Withdrawal Wallet"
          balance={loading ? "Loading…" : fmt(balance)}
          description="Funds available for withdrawal to your BEP20 wallet"
        />

        {/* ── Wallet Addresses ───────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold font-heading text-foreground">BEP20 Withdrawal Addresses</h2>
            {!loading && walletAddresses.length === 0 && (
              <button
                onClick={() => setAddAddrOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Address
              </button>
            )}
          </div>

          {addAddrOpen && walletAddresses.length === 0 && (
            <div className="mb-3 rounded-xl p-4 space-y-3" style={{ background: "hsl(var(--card))", border: "1px solid rgba(212,175,55,0.2)" }}>
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                  BEP20 (BSC) Address
                </label>
                <input
                  type="text"
                  value={newAddr}
                  onChange={(e) => setNewAddr(e.target.value)}
                  placeholder="0x..."
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-mono text-foreground outline-none"
                  style={{ background: "hsl(var(--input))", border: "1px solid hsl(var(--border))" }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. My Binance wallet"
                  className="w-full rounded-xl px-4 py-2.5 text-sm text-foreground outline-none"
                  style={{ background: "hsl(var(--input))", border: "1px solid hsl(var(--border))" }}
                />
              </div>
              {addrError && (
                <p className="text-xs" style={{ color: "#ef4444" }}>{addrError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => void handleAddAddress()}
                  disabled={addingAddr || !newAddr.trim()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37" }}
                >
                  {addingAddr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Save Address
                </button>
                <button
                  onClick={() => { setAddAddrOpen(false); setAddrError(null); setNewAddr(""); setNewLabel(""); }}
                  className="rounded-xl px-4 py-2.5 text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", color: "hsl(var(--muted-foreground))" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="h-12 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : walletAddresses.length === 0 ? (
            <div className="rounded-xl px-4 py-4 text-center text-xs" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <Wallet className="h-5 w-5 mx-auto mb-2 opacity-40" style={{ color: "#D4AF37" }} />
              No BEP20 addresses added yet. Add one to enable withdrawals.
            </div>
          ) : (
            <>
              {/* Locked state notice */}
              <div
                className="flex items-start gap-3 rounded-xl px-4 py-3 mb-2"
                style={{ background: "rgba(212,175,55,0.04)", border: "1px solid rgba(212,175,55,0.18)" }}
              >
                <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: "#D4AF37" }} />
                <p className="text-xs" style={{ color: "rgba(170,179,197,0.7)" }}>
                  For your financial security, your withdrawal wallet cannot be changed after registration.
                </p>
              </div>
              <div className="space-y-2">
                {walletAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.2)" }}
                  >
                    <div className="flex-1 min-w-0">
                      {addr.label && <p className="text-xs font-semibold text-foreground">{addr.label}</p>}
                      <p className="font-mono text-xs truncate" style={{ color: "rgba(170,179,197,0.8)" }}>{addr.address}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#D4AF37" }}>
                          <Lock className="h-2.5 w-2.5" />
                          Permanently Locked
                        </span>
                        <span className="text-xs" style={{ color: "#34d399" }}>Verified</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setModalOpen(true)}
          disabled={walletAddresses.filter((a) => a.isVerified).length === 0}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-semibold text-sm mb-5 lg:mb-6 min-h-[56px] transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)", color: "#0E1B37", boxShadow: "0 4px 20px rgba(212,175,55,0.35)" }}
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Request Withdrawal
        </button>

        {/* ── Transaction History ───────────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Transaction History</h2>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : txHistory.length === 0 ? (
            <div className="rounded-2xl p-10 text-center" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
              <ArrowLeftRight className="h-8 w-8 mx-auto mb-3 opacity-30" style={{ color: "#D4AF37" }} />
              <p className="text-sm font-medium text-foreground">No transactions yet</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                Credits from Binary Matching, Orbit, Level Income, Salary, and transfers will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 24px rgba(0,0,0,0.3)" }}>
              {txHistory.map((tx, i) => {
                const cfg = TYPE_CONFIG[tx.type] ?? {
                  label: tx.type.replace(/_/g, " "),
                  color: "#AAB3C5",
                  bg: "rgba(170,179,197,0.1)",
                  Icon: HelpCircle,
                  credit: true,
                };
                const { label, color, bg, Icon, credit } = cfg;
                const amount = parseFloat(tx.amount);
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
                    style={{ borderBottom: i < txHistory.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: bg }}>
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{label}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(170,179,197,0.5)" }}>
                        {tx.description ?? label} · {timeAgo(tx.createdAt)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold font-mono shrink-0" style={{ color: credit ? "#34d399" : "#f87171" }}>
                      {credit ? "+" : "-"}{fmt(amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Withdrawal Requests ───────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-semibold font-heading text-foreground mb-4">Withdrawal Requests</h2>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : withdrawalRequests.length === 0 ? (
            <div className="rounded-2xl p-8 text-center" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
              <ArrowUpFromLine className="h-7 w-7 mx-auto mb-3 opacity-30" style={{ color: "#D4AF37" }} />
              <p className="text-sm font-medium text-foreground">No withdrawal requests yet</p>
              <p className="text-xs mt-1" style={{ color: "hsl(var(--muted-foreground))" }}>
                Submit a withdrawal request to get started.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: Cards */}
              <div className="md:hidden space-y-3">
                {withdrawalRequests.map((item) => {
                  const s = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.PENDING;
                  const isPending   = item.status === "PENDING";
                  const isCompleted = item.status === "COMPLETED";
                  return (
                    <div key={item.id} className="rounded-xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "0 2px 12px rgba(0,0,0,0.25)" }}>
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <span className="text-lg font-bold font-heading shrink-0" style={{ color: "#f87171" }}>-{fmt(item.amount)}</span>
                        {isPending
                          ? <HoldCountdown requestedAt={item.requestedAt} holdMinutes={holdMinutes} />
                          : <Badge variant={s.variant}>{s.label}</Badge>
                        }
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono" style={{ color: "rgba(170,179,197,0.55)" }}>{shorten(item.walletAddress)}</span>
                        <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{fmtDate(item.createdAt)}</span>
                      </div>
                      {isCompleted && item.txHash && (
                        <div className="mt-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <ExplorerLink txHash={item.txHash} network={item.network} />
                        </div>
                      )}
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
                    {withdrawalRequests.map((item, i) => {
                      const s = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.PENDING;
                      const isPending   = item.status === "PENDING";
                      const isCompleted = item.status === "COMPLETED";
                      return (
                        <tr key={item.id} className="transition-colors hover:bg-white/[0.02]" style={{ borderBottom: i < withdrawalRequests.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <td className="px-5 py-4 font-semibold font-mono" style={{ color: "#f87171" }}>-{fmt(item.amount)}</td>
                          <td className="px-5 py-4">
                            {isPending
                              ? <HoldCountdown requestedAt={item.requestedAt} holdMinutes={holdMinutes} />
                              : <Badge variant={s.variant}>{s.label}</Badge>
                            }
                            {isCompleted && item.txHash && (
                              <div className="mt-1"><ExplorerLink txHash={item.txHash} network={item.network} /></div>
                            )}
                          </td>
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
          addresses={walletAddresses}
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
