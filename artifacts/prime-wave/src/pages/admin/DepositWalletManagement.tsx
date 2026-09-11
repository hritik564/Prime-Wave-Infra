import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Edit2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import legacyQrImage from "@assets/QR_PW_1782675415129.png";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  adminActivateCompanyWallet,
  adminCreateCompanyWallet,
  adminDeleteCompanyWallet,
  adminGetCompanyWallets,
  adminUploadCompanyWalletQr,
  adminUpdateCompanyWalletProfile,
  type CompanyWallet,
} from "@/lib/api";

const GOLD = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED = "rgba(170,179,197,0.58)";
const BORDER = "rgba(255,255,255,0.08)";
const CARD = "hsl(222 62% 9%)";
const BG = "hsl(222 62% 7%)";
const MAX_PROFILES = 5;
const MAX_QR_BYTES = 2 * 1024 * 1024;

type EditorMode = "create" | "edit";
type QrState = "idle" | "selected" | "uploading" | "upload-failed";

function maskAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function buttonStyle(kind: "primary" | "secondary" | "danger" = "secondary") {
  const palette = {
    primary: { background: GOLD, color: "#17120a", border: `${GOLD}99` },
    secondary: { background: "transparent", color: GOLD_L, border: BORDER },
    danger: { background: "rgba(248,113,113,0.08)", color: "#fca5a5", border: "rgba(248,113,113,0.28)" },
  }[kind];
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    border: `1px solid ${palette.border}`,
    background: palette.background,
    color: palette.color,
    borderRadius: 8,
    padding: "9px 13px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  } as const;
}

export default function DepositWalletManagement() {
  const [wallets, setWallets] = useState<CompanyWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [qrState, setQrState] = useState<QrState>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { toasts, toast, dismiss } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWallets(await adminGetCompanyWallets());
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to load deposit wallets.", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function closeEditor() {
    setEditorMode(null);
    setEditingId(null);
    setAddress("");
    setQrFile(null);
    setQrPreview(null);
    setQrState("idle");
    setFormError(null);
  }

  function startCreate() {
    setEditorMode("create");
    setEditingId(null);
    setAddress("");
    setQrFile(null);
    setQrPreview(null);
    setQrState("idle");
    setFormError(null);
  }

  function startEdit(wallet: CompanyWallet) {
    setEditorMode("edit");
    setEditingId(wallet.id);
    setAddress(wallet.walletAddress);
    setQrFile(null);
    setQrPreview(null);
    setQrState("idle");
    setFormError(null);
  }

  function selectQrFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "image/png" || !file.name.toLowerCase().endsWith(".png")) {
      setFormError("Upload a PNG QR image.");
      setQrState("upload-failed");
      return;
    }
    if (file.size > MAX_QR_BYTES) {
      setFormError("The QR image must be 2 MB or smaller.");
      setQrState("upload-failed");
      return;
    }
    setFormError(null);
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
    setQrState("selected");
  }

  async function uploadQr(file: File, walletAddress: string): Promise<string> {
    return adminUploadCompanyWalletQr(file, walletAddress);
  }

  async function saveProfile() {
    setFormError(null);
    const trimmedAddress = address.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmedAddress)) {
      setFormError("Enter a valid BEP20 address: 0x followed by 40 hexadecimal characters.");
      return;
    }
    if (editorMode === "create" && !qrFile) {
      setFormError("A QR image is required for every saved wallet.");
      setQrState("upload-failed");
      return;
    }

    setSaving(true);
    setQrState(qrFile ? "uploading" : "idle");
    try {
      const qrObjectPath = qrFile ? await uploadQr(qrFile, trimmedAddress) : undefined;
      if (editorMode === "create") {
        if (!qrObjectPath) throw new Error("A QR image is required for every saved wallet.");
        await adminCreateCompanyWallet({ walletAddress: trimmedAddress, qrObjectPath });
        toast("Deposit wallet saved. It is inactive until you make it current.", "success");
      } else if (editingId) {
        await adminUpdateCompanyWalletProfile(editingId, {
          walletAddress: trimmedAddress,
          ...(qrObjectPath && { qrObjectPath }),
        });
        toast("Deposit wallet updated.", "success");
      }
       setQrState(qrFile ? "selected" : "idle");
      closeEditor();
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save this wallet.";
       setQrState("upload-failed");
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  async function makeCurrent(wallet: CompanyWallet) {
    if (!window.confirm(
      `Make ${maskAddress(wallet.walletAddress)} the current deposit wallet?\n\nNew deposits will use this wallet. Historical deposit records and recipient snapshots will remain unchanged.`,
    )) return;

    try {
      await adminActivateCompanyWallet(wallet.id);
      toast("New deposit wallet is now current.", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to switch the current wallet.", "error");
    }
  }

  async function deleteWallet(wallet: CompanyWallet) {
    if (wallet.isActive) return;
    if (!window.confirm(`Delete saved wallet ${maskAddress(wallet.walletAddress)}? This cannot be undone.`)) return;
    try {
      await adminDeleteCompanyWallet(wallet.id);
      toast("Inactive deposit wallet deleted.", "success");
      await load();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to delete this wallet.", "error");
    }
  }

  const editingWallet = editingId ? wallets.find((wallet) => wallet.id === editingId) : null;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <section style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(212,175,55,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Wallet size={16} color={GOLD} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: "rgba(255,255,255,0.9)", fontSize: 15, fontWeight: 700 }}>
              Deposit Wallet Management
            </h2>
            <p style={{ margin: "5px 0 0", color: MUTED, fontSize: 12, lineHeight: 1.5 }}>
               Save up to five BEP20 deposit wallet profiles. QR images are stored as uploaded without inspecting their contents.
            </p>
          </div>
          <button type="button" onClick={() => void load()} style={buttonStyle()} title="Refresh saved wallets">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 9, background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.16)", marginBottom: 16 }}>
          <span style={{ color: GOLD_L, fontSize: 12, fontWeight: 700 }}>Saved profiles: {wallets.length}/{MAX_PROFILES}</span>
          <button type="button" onClick={startCreate} disabled={wallets.length >= MAX_PROFILES || loading} style={{ ...buttonStyle("primary"), opacity: wallets.length >= MAX_PROFILES || loading ? 0.5 : 1 }}>
            <Plus size={14} /> Add Wallet
          </button>
        </div>

        {editorMode && (
          <div style={{ padding: 16, borderRadius: 11, background: BG, border: `1px solid ${GOLD}55`, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ margin: 0, color: "rgba(255,255,255,0.9)", fontSize: 14 }}>
                {editorMode === "create" ? "Add BEP20 wallet" : "Edit BEP20 wallet"}
              </h3>
              <button type="button" onClick={closeEditor} style={{ border: 0, background: "transparent", color: MUTED, cursor: "pointer" }} aria-label="Close wallet editor">
                <X size={16} />
              </button>
            </div>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ display: "block", color: MUTED, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>BEP20 wallet address</span>
              <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x…" disabled={saving} style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px", color: "#fff", fontFamily: "monospace", fontSize: 12 }} />
            </label>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ display: "block", color: MUTED, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>QR image {editorMode === "edit" ? "(optional replacement)" : "(required)"}</span>
              <input type="file" accept="image/png,.png" onChange={(event) => selectQrFile(event.target.files?.[0])} disabled={saving} style={{ width: "100%", color: MUTED, fontSize: 12 }} />
            </label>
            {qrPreview ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <img src={qrPreview} alt="Selected QR preview" width={92} height={92} style={{ objectFit: "contain", background: "#fff", borderRadius: 8, padding: 6 }} />
                  <div style={{ color: qrState === "upload-failed" ? "#fca5a5" : qrState === "uploading" ? GOLD_L : "#86efac", fontSize: 12 }}>
                    {qrState === "uploading" ? "Uploading QR image…" : qrState === "upload-failed" ? "QR upload failed." : "QR selected; its contents will not be inspected."}
                </div>
              </div>
            ) : editorMode === "edit" && editingWallet ? (
              <p style={{ margin: "0 0 12px", color: MUTED, fontSize: 12 }}>Existing QR will be retained unless you select a replacement.</p>
            ) : null}
            {formError && <p role="alert" style={{ margin: "0 0 12px", color: "#fca5a5", fontSize: 12 }}>{formError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void saveProfile()} disabled={saving} style={{ ...buttonStyle("primary"), opacity: saving ? 0.65 : 1 }}>
                <Upload size={13} /> {saving ? "Uploading…" : "Save Wallet"}
              </button>
              <button type="button" onClick={closeEditor} disabled={saving} style={buttonStyle()}>Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <p style={{ color: MUTED, fontSize: 12 }}>Loading saved wallets…</p>
        ) : wallets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "26px 16px", border: `1px dashed ${BORDER}`, borderRadius: 10 }}>
            <ShieldCheck size={20} color={MUTED} />
            <p style={{ margin: "8px 0 0", color: MUTED, fontSize: 12 }}>No saved BEP20 profiles found.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {wallets.map((wallet) => (
              <div key={wallet.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.025)", border: `1px solid ${wallet.isActive ? `${GOLD}66` : BORDER}` }}>
                <img src={wallet.qrUrl ?? legacyQrImage} alt={`${wallet.isActive ? "Current" : "Saved"} wallet QR`} width={64} height={64} style={{ flexShrink: 0, objectFit: "contain", background: "#fff", borderRadius: 7, padding: 4 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <span style={{ color: "#fff", fontFamily: "monospace", fontSize: 12 }}>{maskAddress(wallet.walletAddress)}</span>
                    {wallet.isActive && <span style={{ color: "#86efac", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: "rgba(52,211,153,0.1)" }}>CURRENT</span>}
                  </div>
                  <p style={{ margin: 0, color: MUTED, fontSize: 10 }}>Created {formatDate(wallet.createdAt)} · Updated {formatDate(wallet.updatedAt)}</p>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => startEdit(wallet)} style={buttonStyle()}><Edit2 size={12} /> Edit</button>
                  {!wallet.isActive && <button type="button" onClick={() => void makeCurrent(wallet)} style={buttonStyle("primary")}><Check size={12} /> Make Current</button>}
                  {!wallet.isActive && <button type="button" onClick={() => void deleteWallet(wallet)} style={buttonStyle("danger")}><Trash2 size={12} /> Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}