import { useState, useEffect, useCallback } from "react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import { Skeleton } from "@/components/admin/Skeleton";
import {
  Wallet, Edit2, Check, X, AlertTriangle, ShieldCheck, RefreshCw,
} from "lucide-react";
import {
  adminGetCompanyWallets,
  adminUpdateCompanyWallet,
  type CompanyWallet,
} from "@/lib/api";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

const NETWORK_LABELS: Record<string, { label: string; color: string }> = {
  BEP20: { label: "BEP20 (BSC)", color: "#F0B90B" },
  ERC20: { label: "ERC20 (ETH)", color: "#627EEA" },
  TRC20: { label: "TRC20 (TRON)", color: "#FF0013" },
};

const PLACEHOLDER_RE = /placeholder|example|test|0x[A-Za-z]+[A-Z][a-z]+[A-Z]/;

function isPlaceholder(addr: string): boolean {
  return !addr || PLACEHOLDER_RE.test(addr) || addr.length < 20;
}

function truncate(addr: string, head = 10, tail = 10): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

export default function CompanyWalletsPage() {
  const [wallets, setWallets]   = useState<CompanyWallet[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editId, setEditId]     = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving]     = useState(false);
  const { toasts, toast, dismiss } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetCompanyWallets();
      setWallets(data);
    } catch (e: unknown) {
      toast((e as Error).message || "Failed to load company wallets", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  function startEdit(w: CompanyWallet) {
    setEditId(w.id);
    setEditValue(isPlaceholder(w.walletAddress) ? "" : w.walletAddress);
  }

  function cancelEdit() {
    setEditId(null);
    setEditValue("");
  }

  async function saveEdit(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed.length < 20) {
      toast("Please enter a valid wallet address", "error");
      return;
    }
    setSaving(true);
    try {
      const updated = await adminUpdateCompanyWallet(id, { walletAddress: trimmed });
      setWallets(prev => prev.map(w => w.id === id ? updated : w));
      toast("Wallet address updated successfully", "success");
      setEditId(null);
      setEditValue("");
    } catch (e: unknown) {
      toast((e as Error).message || "Failed to update wallet address", "error");
    } finally {
      setSaving(false);
    }
  }

  const allConfigured = wallets.every(w => !isPlaceholder(w.walletAddress));

  return (
    <AdminLayout>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div style={{ padding: "24px 28px", maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `rgba(212,175,55,0.12)`,
            border: `1px solid rgba(212,175,55,0.2)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Wallet size={18} color={GOLD} />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>
              Company Wallets
            </h1>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
              Destination addresses users must send funds to when making a deposit
            </p>
          </div>
          <button
            onClick={load}
            style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: "6px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              color: MUTED, fontSize: 13,
            }}
            title="Refresh"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>

        {/* Status banner */}
        {!loading && wallets.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderRadius: 10, marginBottom: 24,
            background: allConfigured
              ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${allConfigured ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
          }}>
            {allConfigured
              ? <ShieldCheck size={16} color="#22c55e" />
              : <AlertTriangle size={16} color="#ef4444" />}
            <span style={{ fontSize: 13, color: allConfigured ? "#22c55e" : "#ef4444" }}>
              {allConfigured
                ? "All wallet addresses are configured. New deposits will verify correctly."
                : `${wallets.filter(w => isPlaceholder(w.walletAddress)).length} wallet address(es) still use placeholder values — deposits cannot verify until fixed.`}
            </span>
          </div>
        )}

        {/* Wallet cards */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{
                background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 14, padding: 20, height: 100,
              }}>
                <Skeleton width="30%" height={16} />
                <Skeleton width="70%" height={14} style={{ marginTop: 12 }} />
              </div>
            ))}
          </div>
        ) : wallets.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "48px 24px",
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14,
          }}>
            <Wallet size={32} color={MUTED} style={{ marginBottom: 12 }} />
            <p style={{ color: MUTED, fontSize: 14 }}>No company wallets found</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {wallets.map(w => {
              const meta    = NETWORK_LABELS[w.network] ?? { label: w.network, color: GOLD };
              const badAddr = isPlaceholder(w.walletAddress);
              const isEditing = editId === w.id;

              return (
                <div key={w.id} style={{
                  background: CARD,
                  border: `1px solid ${badAddr && !isEditing ? "rgba(239,68,68,0.3)" : BORDER}`,
                  borderRadius: 14, padding: "20px 22px",
                }}>
                  {/* Network badge + edit button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                      padding: "3px 10px", borderRadius: 20,
                      background: `${meta.color}18`,
                      border: `1px solid ${meta.color}40`,
                      color: meta.color,
                    }}>
                      {meta.label}
                    </span>
                    {w.label && (
                      <span style={{ fontSize: 12, color: MUTED }}>{w.label}</span>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(w)}
                        style={{
                          marginLeft: "auto", background: "transparent",
                          border: `1px solid ${BORDER}`, borderRadius: 8,
                          padding: "5px 12px", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 6,
                          color: GOLD_L, fontSize: 12,
                        }}
                      >
                        <Edit2 size={12} />
                        Edit
                      </button>
                    )}
                  </div>

                  {/* Address display / edit */}
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder={`Enter ${meta.label} wallet address`}
                        style={{
                          width: "100%", background: BG,
                          border: `1px solid ${GOLD}60`,
                          borderRadius: 8, padding: "10px 14px",
                          color: "#fff", fontSize: 13, fontFamily: "monospace",
                          outline: "none", boxSizing: "border-box",
                        }}
                        onKeyDown={e => {
                          if (e.key === "Enter") saveEdit(w.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        disabled={saving}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => saveEdit(w.id)}
                          disabled={saving || !editValue.trim()}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: GOLD, border: "none", borderRadius: 8,
                            padding: "8px 16px", cursor: saving ? "not-allowed" : "pointer",
                            color: "#000", fontWeight: 600, fontSize: 13,
                            opacity: saving || !editValue.trim() ? 0.6 : 1,
                          }}
                        >
                          <Check size={14} />
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            background: "transparent",
                            border: `1px solid ${BORDER}`,
                            borderRadius: 8, padding: "8px 16px",
                            cursor: "pointer", color: MUTED, fontSize: 13,
                          }}
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{
                        fontFamily: "monospace", fontSize: 13,
                        color: badAddr ? "#ef4444" : "#e2e8f0",
                        wordBreak: "break-all",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        {badAddr && <AlertTriangle size={14} color="#ef4444" style={{ flexShrink: 0 }} />}
                        <span title={w.walletAddress}>
                          {badAddr ? w.walletAddress : truncate(w.walletAddress, 18, 16)}
                        </span>
                      </div>
                      {w.updatedAt && (
                        <p style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
                          Last updated {new Date(w.updatedAt).toLocaleString()}
                          {w.updatedBy ? ` by ${w.updatedBy}` : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info box */}
        <div style={{
          marginTop: 24, padding: "14px 16px", borderRadius: 10,
          background: "rgba(99,102,241,0.06)",
          border: "1px solid rgba(99,102,241,0.18)",
        }}>
          <p style={{ fontSize: 12, color: "rgba(99,102,241,0.9)", margin: 0, lineHeight: 1.6 }}>
            <strong>Important:</strong> These are the addresses users send crypto to when making a deposit.
            The verification engine compares the on-chain recipient of each transaction against the address stored here.
            If the address is wrong or a placeholder, <strong>all deposits will fail verification</strong>.
            Only SUPER_ADMIN accounts can edit these values.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
