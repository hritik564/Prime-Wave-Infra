import { useState } from "react";
import { Search, Wallet, Zap, Play, Loader2, CheckCircle, AlertTriangle, Copy, ChevronDown, ChevronUp } from "lucide-react";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "@/components/admin/Toast";
import {
  blockchainValidateAddress,
  blockchainCheckBalance,
  blockchainEstimateGas,
  blockchainSimulate,
  type BlockchainAddressValidation,
  type BlockchainBalanceResult,
  type BlockchainGasEstimate,
  type BlockchainSimulateResult,
} from "@/lib/api";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const GOLD   = "#D4AF37";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const CARD   = "hsl(222 62% 9%)";

// ─── Panel ────────────────────────────────────────────────────────────────────
function Panel({
  title, icon: Icon, children,
}: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "rgba(212,175,55,0.1)" }}>
          <Icon className="h-4 w-4" style={{ color: GOLD }} />
        </div>
        <p className="font-semibold text-foreground">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Input({
  label, value, onChange, placeholder, mono = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: MUTED }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl px-4 py-2.5 text-sm text-foreground outline-none ${mono ? "font-mono" : ""}`}
        style={{ background: "hsl(var(--input))", border: `1px solid hsl(var(--border))` }}
      />
    </div>
  );
}

function ResultBox<T extends object>({
  data, color = GOLD,
}: { data: T | null; color?: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;
  const json = JSON.stringify(data, null, 2);
  const lines = json.split("\n");
  const preview = lines.slice(0, 6).join("\n");
  const truncated = lines.length > 6;
  return (
    <div className="mt-4 rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid rgba(212,175,55,0.15)` }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
        <p className="text-xs font-semibold" style={{ color }}>Result</p>
        <button
          onClick={() => void navigator.clipboard.writeText(json)}
          className="flex items-center gap-1 text-xs"
          style={{ color: MUTED }}
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <pre className="text-xs px-4 py-3 overflow-x-auto" style={{ color: "rgba(255,255,255,0.75)", fontFamily: "monospace" }}>
        {expanded ? json : preview}
        {truncated && !expanded && "\n..."}
      </pre>
      {truncated && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs border-t"
          style={{ color: MUTED, borderColor: "rgba(255,255,255,0.06)" }}
        >
          {expanded ? <><ChevronUp className="h-3 w-3" /> Collapse</> : <><ChevronDown className="h-3 w-3" /> Show all</>}
        </button>
      )}
    </div>
  );
}

function RunButton({
  loading, onClick, label,
}: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-50"
      style={
        loading
          ? { background: "rgba(255,255,255,0.06)", color: MUTED }
          : { background: `linear-gradient(135deg, ${GOLD} 0%, #F3D37A 100%)`, color: "#0E1B37", boxShadow: "0 4px 12px rgba(212,175,55,0.25)" }
      }
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
      {loading ? "Running…" : label}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BlockchainTesterPage() {
  const { toasts, toast, dismiss } = useToast();

  // ── Validate address ─────────────────────────────────────────────────────────
  const [valAddr, setValAddr]       = useState("");
  const [valLoading, setValLoading] = useState(false);
  const [valResult, setValResult]   = useState<BlockchainAddressValidation | null>(null);

  const runValidate = async () => {
    setValLoading(true); setValResult(null);
    try {
      const r = await blockchainValidateAddress(valAddr);
      setValResult(r);
      toast(r.valid ? "Address is valid" : "Address is invalid", r.valid ? "success" : "error");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally { setValLoading(false); }
  };

  // ── Check balance ────────────────────────────────────────────────────────────
  const [balAddr, setBalAddr]       = useState("");
  const [balLoading, setBalLoading] = useState(false);
  const [balResult, setBalResult]   = useState<BlockchainBalanceResult | null>(null);

  const runBalance = async () => {
    setBalLoading(true); setBalResult(null);
    try {
      const r = await blockchainCheckBalance(balAddr);
      setBalResult(r);
      toast("Balance retrieved", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally { setBalLoading(false); }
  };

  // ── Estimate gas ─────────────────────────────────────────────────────────────
  const [gasTo, setGasTo]       = useState("");
  const [gasAmt, setGasAmt]     = useState("");
  const [gasLoading, setGasLoading] = useState(false);
  const [gasResult, setGasResult]   = useState<BlockchainGasEstimate | null>(null);

  const runGas = async () => {
    setGasLoading(true); setGasResult(null);
    try {
      const r = await blockchainEstimateGas(gasTo, gasAmt);
      setGasResult(r);
      toast(`Estimated fee: ${r.estimatedFeeBnb} BNB`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally { setGasLoading(false); }
  };

  // ── Simulate transfer ────────────────────────────────────────────────────────
  const [simTo, setSimTo]       = useState("");
  const [simAmt, setSimAmt]     = useState("");
  const [simId, setSimId]       = useState("");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult]   = useState<BlockchainSimulateResult | null>(null);

  const runSim = async () => {
    setSimLoading(true); setSimResult(null);
    try {
      const r = await blockchainSimulate(simTo, simAmt, simId || undefined);
      setSimResult(r);
      toast("Simulation complete — no funds moved", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally { setSimLoading(false); }
  };

  return (
    <AdminLayout>
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      <div className="space-y-6 p-4 lg:p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Blockchain Tester</h1>
          <p className="text-sm mt-0.5" style={{ color: MUTED }}>
            Test blockchain operations safely. All operations are read-only or dry-run. No funds are moved.
          </p>
        </div>

        {/* Dry run badge */}
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.2)" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
          <p className="text-sm" style={{ color: GOLD }}>
            Dry Run Mode — All transactions are simulated. No funds are sent or signed.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── Validate Address ── */}
          <Panel title="Validate BEP20 Address" icon={Search}>
            <Input
              label="Wallet Address"
              value={valAddr}
              onChange={setValAddr}
              placeholder="0x..."
              mono
            />
            {valResult && (
              <div className="mt-3 flex items-center gap-2">
                {valResult.valid
                  ? <CheckCircle className="h-4 w-4" style={{ color: "#34d399" }} />
                  : <AlertTriangle className="h-4 w-4" style={{ color: "#ef4444" }} />}
                <p className="text-sm font-semibold" style={{ color: valResult.valid ? "#34d399" : "#ef4444" }}>
                  {valResult.valid ? "Valid address" : valResult.reason ?? "Invalid address"}
                </p>
              </div>
            )}
            <RunButton loading={valLoading} onClick={() => void runValidate()} label="Validate Address" />
          </Panel>

          {/* ── Check Balance ── */}
          <Panel title="Check Wallet Balance" icon={Wallet}>
            <Input
              label="Wallet Address"
              value={balAddr}
              onChange={setBalAddr}
              placeholder="0x..."
              mono
            />
            {balResult && (
              <div className="mt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: MUTED }}>BNB (native)</span>
                  <span className="text-sm font-mono font-semibold text-foreground">{balResult.native?.formatted ?? "—"} BNB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: MUTED }}>USDT (BEP20)</span>
                  <span className="text-sm font-mono font-semibold" style={{ color: "#34d399" }}>{balResult.token?.formatted ?? "—"} USDT</span>
                </div>
              </div>
            )}
            <RunButton loading={balLoading} onClick={() => void runBalance()} label="Check Balance" />
          </Panel>

          {/* ── Estimate Gas ── */}
          <Panel title="Estimate Gas Fee" icon={Zap}>
            <div className="space-y-3">
              <Input label="Recipient Address" value={gasTo} onChange={setGasTo} placeholder="0x..." mono />
              <Input label="USDT Amount" value={gasAmt} onChange={setGasAmt} placeholder="100.00" />
            </div>
            {gasResult && (
              <div className="mt-3 space-y-2">
                {[
                  ["Gas Limit",  gasResult.estimatedGas],
                  ["Gas Price",  `${gasResult.gasPriceGwei} Gwei`],
                  ["Fee (BNB)",  `${gasResult.estimatedFeeBnb} BNB`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-xs" style={{ color: MUTED }}>{k}</span>
                    <span className="text-sm font-mono font-semibold text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            )}
            <RunButton loading={gasLoading} onClick={() => void runGas()} label="Estimate Gas" />
          </Panel>

          {/* ── Simulate Transfer ── */}
          <Panel title="Simulate Withdrawal" icon={Play}>
            <div className="space-y-3">
              <Input label="Recipient Address" value={simTo} onChange={setSimTo} placeholder="0x..." mono />
              <Input label="USDT Amount" value={simAmt} onChange={setSimAmt} placeholder="100.00" />
              <Input label="Withdrawal ID (optional)" value={simId} onChange={setSimId} placeholder="PW-WD-000001" />
            </div>
            {simResult && <ResultBox data={simResult} color="#34d399" />}
            <RunButton loading={simLoading} onClick={() => void runSim()} label="Simulate (Dry Run)" />
          </Panel>
        </div>
      </div>
    </AdminLayout>
  );
}
