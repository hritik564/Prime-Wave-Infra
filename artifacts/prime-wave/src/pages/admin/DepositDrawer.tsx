import { useState, useEffect, memo } from "react";
import {
  X, Copy, ExternalLink, CheckCircle, Clock, XCircle, Loader2,
  User, Wallet, CreditCard, Activity, Shield,
} from "lucide-react";
import {
  adminGetDepositById,
  adminApproveDeposit,
  adminRejectDeposit,
  adminMarkDepositConfirming,
  type AdminDepositDetail,
  type AdminDepositStatus,
} from "@/lib/api";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";
const BG     = "hsl(222 62% 7%)";

const $ = (n: number | string) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CFG: Record<string, { color: string; bg: string; label: string; Icon: React.ElementType }> = {
  PENDING:    { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  label: "Pending",    Icon: Clock       },
  CONFIRMING: { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  label: "Confirming", Icon: Loader2     },
  APPROVED:   { color: "#34d399", bg: "rgba(52,211,153,0.12)",  label: "Approved",   Icon: CheckCircle },
  REJECTED:   { color: "#f87171", bg: "rgba(248,113,113,0.12)", label: "Rejected",   Icon: XCircle     },
};

const NETWORK_EXPLORER: Record<string, string> = {
  BEP20: "https://bscscan.com/tx/",
  TRC20: "https://tronscan.org/#/transaction/",
  ERC20: "https://etherscan.io/tx/",
  SOL:   "https://solscan.io/tx/",
};

function StatusBadge({ s }: { s: string }) {
  const c = STATUS_CFG[s] ?? STATUS_CFG.PENDING;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: c.color, background: c.bg, padding: "3px 10px", borderRadius: 5 }}>
      {c.label}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} title="Copy" style={{ background: "none", border: "none", cursor: "pointer", color: copied ? "#34d399" : MUTED, padding: "0 4px" }}>
      <Copy size={13} />
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "7px 0", borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ fontSize: 12, color: MUTED, flexShrink: 0, marginRight: 12 }}>{label}</span>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.82)", textAlign: "right" }}>{children}</span>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none", border: "none", cursor: "pointer",
        fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? GOLD_L : MUTED,
        borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
        padding: "8px 14px", whiteSpace: "nowrap", transition: "color 0.15s",
      }}
    >
      {children}
    </button>
  );
}

type Tab = "summary" | "member" | "wallet" | "payment" | "timeline";

interface DrawerProps {
  depositId:  string | null;
  onClose:    () => void;
  onApprove?: (id: string) => void;
  onReject?:  (id: string) => void;
  onConfirm?: (id: string) => void;
  actionLoading: string | null;
}

const DepositDrawer = memo(function DepositDrawer({
  depositId, onClose, onApprove, onReject, onConfirm, actionLoading,
}: DrawerProps) {
  const [tab,     setTab]     = useState<Tab>("summary");
  const [deposit, setDeposit] = useState<AdminDepositDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!depositId) { setDeposit(null); return; }
    setLoading(true);
    setTab("summary");
    adminGetDepositById(depositId)
      .then(setDeposit)
      .catch(() => setDeposit(null))
      .finally(() => setLoading(false));
  }, [depositId]);

  const isOpen = !!depositId;

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
    zIndex: 1000, opacity: isOpen ? 1 : 0,
    pointerEvents: isOpen ? "auto" : "none",
    transition: "opacity 0.2s",
  };

  const drawer: React.CSSProperties = {
    position: "fixed", top: 0, right: 0, bottom: 0,
    width: 460, maxWidth: "100vw",
    background: BG, borderLeft: `1px solid ${BORDER}`,
    zIndex: 1001, display: "flex", flexDirection: "column",
    transform: isOpen ? "translateX(0)" : "translateX(100%)",
    transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
  };

  if (!isOpen) return (
    <>
      <div style={overlay} onClick={onClose} />
      <div style={drawer} />
    </>
  );

  const d    = deposit;
  const busy = actionLoading === depositId;

  const canAct   = d?.status === "PENDING" || d?.status === "CONFIRMING";
  const canConf  = d?.status === "PENDING";

  const statusCfg = STATUS_CFG[d?.status ?? "PENDING"];

  return (
    <>
      <div style={overlay} onClick={onClose} />
      <div style={drawer}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Deposit Detail</div>
            {d && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>ID: {d.id.slice(0, 16)}…</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {d && <StatusBadge s={d.status} />}
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, display: "flex", padding: 4 }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {loading && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={24} color={GOLD} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}

        {!loading && d && (
          <>
            {/* Action buttons */}
            {canAct && (onApprove || onReject || onConfirm) && (
              <div style={{ padding: "12px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 8, flexShrink: 0 }}>
                {onApprove && <ActionBtn
                  label="Approve" color="#34d399" bg="rgba(52,211,153,0.1)"
                  onClick={() => onApprove(d.id)}
                  loading={busy}
                />}
                {canConf && onConfirm && (
                  <ActionBtn
                    label="Confirming" color="#60a5fa" bg="rgba(96,165,250,0.1)"
                    onClick={() => onConfirm(d.id)}
                    loading={busy}
                  />
                )}
                {onReject && <ActionBtn
                  label="Reject" color="#f87171" bg="rgba(248,113,113,0.1)"
                  onClick={() => onReject(d.id)}
                  loading={busy}
                />}
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}`, overflowX: "auto", flexShrink: 0 }}>
              {(["summary","member","wallet","payment","timeline"] as Tab[]).map(t => (
                <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </TabBtn>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {tab === "summary" && <SummaryTab d={d} statusCfg={statusCfg} />}
              {tab === "member"  && <MemberTab  d={d} />}
              {tab === "wallet"  && <WalletTab  d={d} />}
              {tab === "payment" && <PaymentTab d={d} />}
              {tab === "timeline" && <TimelineTab d={d} />}
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
});

function ActionBtn({ label, color, bg, onClick, loading }: {
  label: string; color: string; bg: string;
  onClick: () => void; loading: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${color}30`,
        background: bg, color, fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1, transition: "opacity 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function SummaryTab({ d, statusCfg }: { d: AdminDepositDetail; statusCfg: { color: string; label: string } }) {
  return (
    <div>
      <div style={{ background: CARD, borderRadius: 10, padding: "14px 16px", marginBottom: 16, border: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Deposit Amount</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: GOLD_L }}>{`$${Number(d.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>{d.network} · {new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
      </div>

      <div style={{ background: CARD, borderRadius: 10, padding: "8px 16px", border: `1px solid ${BORDER}` }}>
        <Row label="Deposit ID"><span style={{ fontFamily: "monospace", fontSize: 11 }}>{d.id}</span><CopyBtn text={d.id} /></Row>
        <Row label="Status"><span style={{ color: statusCfg.color }}>{statusCfg.label}</span></Row>
        <Row label="Network">{d.network}</Row>
        <Row label="Source">Manual</Row>
        {d.approvedAt && <Row label="Approved At">{new Date(d.approvedAt).toLocaleString()}</Row>}
        {d.approver && <Row label="Approved By">{d.approver.email}</Row>}
        {d.rejectedReason && <Row label="Rejected Reason"><span style={{ color: "#f87171" }}>{d.rejectedReason}</span></Row>}
        <Row label="Submitted">{new Date(d.createdAt).toLocaleString()}</Row>
      </div>
    </div>
  );
}

function MemberTab({ d }: { d: AdminDepositDetail }) {
  const u = d.user;
  const initials = `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: `rgba(212,175,55,0.15)`, border: `1px solid ${GOLD}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: GOLD_L, flexShrink: 0 }}>
          {initials}
        </div>
        <div>
          <div style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{u.firstName} {u.lastName}</div>
          <div style={{ fontSize: 12, color: MUTED }}>@{u.username}</div>
        </div>
      </div>
      <div style={{ background: CARD, borderRadius: 10, padding: "8px 16px", border: `1px solid ${BORDER}` }}>
        <Row label="Email">{u.email}</Row>
        <Row label="User ID"><span style={{ fontFamily: "monospace", fontSize: 11 }}>{u.id}</span></Row>
        <Row label="Referral Code">{u.referralCode}</Row>
        <Row label="Account Status">
          <span style={{ color: u.status === "ACTIVE" ? "#34d399" : "#f87171" }}>{u.status}</span>
        </Row>
      </div>
    </div>
  );
}

function WalletTab({ d }: { d: AdminDepositDetail }) {
  const w = d.user.wallet;
  if (!w) return <div style={{ color: MUTED, fontSize: 13 }}>Wallet data unavailable</div>;

  const items = [
    { label: "Deposit Wallet",    value: w.depositWallet,    color: GOLD_L },
    { label: "Income Wallet",     value: w.incomeWallet,     color: "#60a5fa" },
    { label: "Withdrawal Wallet", value: w.withdrawalWallet, color: "#34d399" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(it => (
        <div key={it.label} style={{ background: CARD, borderRadius: 10, padding: "14px 16px", border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{it.label}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: it.color }}>{$(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

function PaymentTab({ d }: { d: AdminDepositDetail }) {
  const explorerBase = NETWORK_EXPLORER[d.network] ?? "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {d.screenshotUrl && (
        <div style={{ background: CARD, borderRadius: 10, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", fontSize: 11, color: MUTED, borderBottom: `1px solid ${BORDER}` }}>Payment Screenshot</div>
          <a href={d.screenshotUrl} target="_blank" rel="noreferrer">
            <img src={d.screenshotUrl} alt="Payment proof" style={{ width: "100%", display: "block", maxHeight: 200, objectFit: "cover" }} />
          </a>
        </div>
      )}
      <div style={{ background: CARD, borderRadius: 10, padding: "8px 16px", border: `1px solid ${BORDER}` }}>
        <div style={{ padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Transaction Hash (TXID)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.8)", wordBreak: "break-all" }}>{d.txHash}</span>
            <CopyBtn text={d.txHash} />
            {explorerBase && (
              <a href={explorerBase + d.txHash} target="_blank" rel="noreferrer" style={{ color: MUTED, display: "flex" }}>
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
        <div style={{ padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>Company Wallet (Destination)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.8)", wordBreak: "break-all" }}>{d.companyWallet}</span>
            <CopyBtn text={d.companyWallet} />
          </div>
        </div>
        <Row label="Network">{d.network}</Row>
        <Row label="Blockchain Status">
          <span style={{ color: d.status === "APPROVED" ? "#34d399" : d.status === "CONFIRMING" ? "#60a5fa" : MUTED }}>
            {d.status === "APPROVED" ? "Confirmed" : d.status === "CONFIRMING" ? "Awaiting Confirmation" : "Unverified"}
          </span>
        </Row>
      </div>
    </div>
  );
}

function TimelineTab({ d }: { d: AdminDepositDetail }) {
  const events: { label: string; time: string | null; active: boolean; color: string }[] = [
    { label: "Deposit Submitted", time: d.createdAt, active: true, color: "#60a5fa" },
    {
      label: "Finance Review",
      time: d.status === "CONFIRMING" || d.status === "APPROVED" || d.status === "REJECTED" ? d.createdAt : null,
      active: d.status !== "PENDING",
      color: "#fbbf24",
    },
    {
      label: "Blockchain Confirming",
      time: d.status === "CONFIRMING" ? d.createdAt : d.status === "APPROVED" ? d.approvedAt : null,
      active: d.status === "CONFIRMING" || d.status === "APPROVED",
      color: "#60a5fa",
    },
    {
      label: d.status === "REJECTED" ? "Rejected" : "Approved & Wallet Credited",
      time: d.approvedAt,
      active: d.status === "APPROVED" || d.status === "REJECTED",
      color: d.status === "REJECTED" ? "#f87171" : "#34d399",
    },
  ];

  return (
    <div>
      {events.map((ev, i) => (
        <div key={i} style={{ display: "flex", gap: 14, marginBottom: 4 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: ev.active ? ev.color : BORDER, border: `2px solid ${ev.active ? ev.color : MUTED}`, marginTop: 3 }} />
            {i < events.length - 1 && <div style={{ width: 2, flex: 1, background: ev.active ? `${ev.color}40` : BORDER, minHeight: 24 }} />}
          </div>
          <div style={{ paddingBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: ev.active ? "rgba(255,255,255,0.9)" : MUTED }}>{ev.label}</div>
            {ev.time && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{new Date(ev.time).toLocaleString()}</div>}
            {d.approver && ev.label.includes("Approved") && d.status === "APPROVED" && (
              <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>by {d.approver.email}</div>
            )}
            {d.rejectedReason && ev.label === "Rejected" && (
              <div style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>{d.rejectedReason}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default DepositDrawer;
