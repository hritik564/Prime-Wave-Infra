import { ArrowDown, ArrowUpRight, Check, Code2, Copy, LockKeyhole, RefreshCw, Send, ShieldCheck, WalletCards, Zap } from "lucide-react";

export function NetworkVisual() {
  const nodes = [{ x: 50, y: 35 }, { x: 25, y: 65 }, { x: 72, y: 67 }, { x: 40, y: 87 }, { x: 84, y: 38 }, { x: 16, y: 30 }];
  return <div className="visual-frame network-visual" data-testid="visual-network-map">
     <div className="visual-topline"><span className="pw-mono">NETWORK / TOPOLOGY</span><span className="visual-badge">PREVIEW</span></div>
    <svg viewBox="0 0 100 100" aria-label="Abstract connected network diagram">
      <g className="network-lines">{nodes.map((node, i) => <line key={i} x1="50" y1="35" x2={node.x} y2={node.y} />)}<line x1="25" y1="65" x2="40" y2="87" /><line x1="72" y1="67" x2="84" y2="38" /></g>
      {nodes.map((node, i) => <circle key={i} cx={node.x} cy={node.y} r={i === 0 ? 2.8 : 1.8} className={i === 0 ? "core-node" : ""} />)}
    </svg>
     <div className="network-legend"><span><i className="legend-cyan" /> network core</span><span><i className="legend-muted" /> peer connection</span></div>
  </div>;
}

export function EcosystemVisual() {
  return <div className="visual-frame ecosystem-visual" data-testid="visual-ecosystem-map">
    <div className="visual-topline"><span className="pw-mono">PRIMEWAVE / ECOSYSTEM MAP</span><span className="visual-badge">DIRECTION</span></div>
    <div className="ecosystem-flow">
      <div className="ecosystem-node ecosystem-root"><strong>PRIMEWAVE</strong><span>AI + WEB3 ECOSYSTEM</span></div>
      <div className="ecosystem-stem" />
      <div className="ecosystem-products">
        <div className="ecosystem-branch"><span>CHAIN</span><i /></div>
        <div className="ecosystem-branch"><span>PWDEX</span><i /></div>
        <div className="ecosystem-branch"><span>PWSWAP</span><i /></div>
      </div>
      <div className="ecosystem-stem ecosystem-stem-lower" />
      <div className="ecosystem-node ecosystem-wallet"><strong>PRIMEWAVE WALLET</strong><span>SELF-CUSTODY</span></div>
      <div className="ecosystem-stem" />
      <div className="ecosystem-node ecosystem-apps"><strong>APPLICATIONS</strong><span>FUTURE SURFACES</span></div>
    </div>
  </div>;
}

export function DexVisual() {
  return <div className="visual-frame product-visual dex-visual" data-testid="visual-dex">
    <div className="visual-topline"><span className="pw-mono">PWDEX / MARKETS</span><span className="visual-badge">PREVIEW</span></div>
    <div className="chart-head"><div><small>PRIME / WAVE</small><strong>—</strong></div><div className="chart-price">MARKET DATA <span>COMING SOON</span></div></div>
    <svg viewBox="0 0 500 170" preserveAspectRatio="none" className="line-chart"><defs><linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#52e6e0" stopOpacity=".25" /><stop offset="1" stopColor="#52e6e0" stopOpacity="0" /></linearGradient></defs><path d="M0 145 C35 132 48 140 70 118 S110 130 128 105 S164 118 180 92 S218 110 242 74 S275 99 302 55 S335 79 365 60 S397 70 422 28 S460 51 500 16 L500 170 L0 170 Z" fill="url(#lineFill)" /><path d="M0 145 C35 132 48 140 70 118 S110 130 128 105 S164 118 180 92 S218 110 242 74 S275 99 302 55 S335 79 365 60 S397 70 422 28 S460 51 500 16" fill="none" stroke="#52e6e0" strokeWidth="2" /></svg>
    <div className="orderbook"><span>ORDER BOOK</span><i /><i /><i /><i /></div>
  </div>;
}

export function SwapVisual() {
  return <div className="visual-frame swap-visual" data-testid="visual-swap">
     <div className="visual-topline"><span className="pw-mono">PWSWAP / ROUTER</span><span className="visual-badge">COMING SOON</span></div>
    <div className="swap-row"><div><small>YOU SEND</small><strong>0.00</strong></div><span className="token-chip">PW <ArrowDown size={13} /></span></div>
    <div className="swap-switch"><RefreshCw size={15} /></div>
    <div className="swap-row"><div><small>YOU RECEIVE</small><strong>0.00</strong></div><span className="token-chip muted">SELECT <ArrowDown size={13} /></span></div>
     <span className="visual-button visual-button-disabled" aria-label="PWSwap coming soon">Coming Soon</span>
     <p className="visual-caption"><Zap size={13} /> product preview — route details coming soon</p>
  </div>;
}

export function WalletVisual() {
  return <div className="visual-frame wallet-visual" data-testid="visual-wallet">
     <div className="visual-topline"><span className="pw-mono">PRIMEWAVE WALLET</span><span className="visual-badge">COMING SOON</span></div>
    <div className="wallet-balance"><small>TOTAL BALANCE</small><strong>— — —</strong><span>values hidden in preview</span></div>
    <div className="wallet-card"><div><span className="pw-mono">PW WALLET</span><WalletCards size={21} /></div><strong>0x · · · · · · 7A4C</strong><span>PrimeWave network</span></div>
    <div className="wallet-actions"><span><Send size={14} /> Send</span><span><ArrowDown size={14} /> Receive</span><span><Copy size={14} /> Copy</span></div>
  </div>;
}

export function DeveloperVisual() {
  return <div className="visual-frame code-visual" data-testid="visual-developer-stack">
    <div className="visual-topline"><span className="pw-mono">PRIMEWAVE / DEVELOPER SURFACE</span><Code2 size={15} /></div>
    <div className="code-lines"><span><b>01</b> <em>DEVELOPER SDK</em></span><span><b>02</b></span><span><b>03</b> <strong>network infrastructure</strong></span><span><b>04</b> <strong>smart contract interfaces</strong></span><span><b>05</b> <strong>intelligent applications</strong></span><span><b>06</b> <i>developer resources</i></span><span><b>07</b></span><span><b>08</b> <em>COMING SOON</em></span></div>
    <div className="code-status"><Check size={13} /> Developer resources <span>COMING SOON</span></div>
  </div>;
}

export function SecurityVisual() {
  return <div className="visual-frame security-visual" data-testid="visual-security">
    <div className="visual-topline"><span className="pw-mono">SECURITY POSTURE</span><ShieldCheck size={15} /></div>
    <div className="security-ring"><div><ShieldCheck size={25} /><strong>DEFENSE<br />IN DEPTH</strong></div></div>
    <div className="security-list"><span><i />Key ownership <b>LOCAL</b></span><span><i />Protocol status <b>COMING SOON</b></span><span><i />Audit record <b>COMING SOON</b></span></div>
  </div>;
}