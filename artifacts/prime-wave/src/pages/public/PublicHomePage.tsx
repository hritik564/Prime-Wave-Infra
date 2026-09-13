import { ArrowDownRight, ArrowRight, ArrowUpRight, LockKeyhole, ShieldCheck, Sparkles, Waypoints } from "lucide-react";
import { Link } from "wouter";
import PublicShell, { PublicMeta } from "@/components/public/PublicShell";
import { DeveloperVisual, DexVisual, NetworkVisual, SecurityVisual, SwapVisual, WalletVisual } from "@/components/public/ProductVisuals";

const products = [
  { number: "01", title: "PrimeWave Chain", copy: "A dependable base layer for applications that need clear primitives, predictable execution, and room to grow.", href: "/chain", visual: <NetworkVisual /> },
  { number: "02", title: "PWDEX", copy: "A market interface designed around transparent mechanics, composable liquidity, and a calm trading experience.", href: "/dex", visual: <DexVisual /> },
  { number: "03", title: "PWSwap", copy: "A focused routing layer for moving assets across the PrimeWave ecosystem with fewer decisions in the way.", href: "/swap", visual: <SwapVisual /> },
  { number: "04", title: "PrimeWave Wallet", copy: "A clear, self-custodial home for the keys, assets, and applications that make the network useful.", href: "/wallet", visual: <WalletVisual /> },
];

export default function PublicHomePage() {
  return <PublicShell>
    <PublicMeta title="Infrastructure for a decentralized future" description="PrimeWave builds dependable blockchain infrastructure, market interfaces, and developer tools for a decentralized future." />
    <section className="pw-hero">
      <div className="pw-hero-grid" />
      <div className="pw-container pw-hero-content">
        <div className="pw-kicker"><span className="kicker-line" /> PRIMEWAVE SYSTEMS <span className="pw-mono">/ 001</span></div>
        <h1>Infrastructure<br /><span>for a decentralized</span><br />future.</h1>
         <p className="pw-hero-copy">PrimeWave brings blockchain infrastructure, decentralized markets, asset exchange, and self-custody together in one integrated ecosystem.</p>
         <div className="pw-hero-actions"><Link href="/ecosystem" className="pw-button" data-testid="link-hero-ecosystem">Explore the Ecosystem <ArrowRight size={16} /></Link><Link href="/login" className="pw-outline-button" data-testid="link-hero-launch">Launch App <ArrowDownRight size={16} /></Link></div>
        <div className="pw-hero-foot"><span className="pw-mono">SYSTEMS DESIGNED TO COMPOSE</span><span className="hero-scroll"><span /> scroll to explore</span></div>
      </div>
      <div className="pw-hero-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>PW</span></div><i className="orbit-point point-a" /><i className="orbit-point point-b" /><i className="orbit-point point-c" /></div>
    </section>

     <section className="pw-section pw-intro"><div className="pw-container intro-grid"><div className="section-index">01 <span>/</span> THE ECOSYSTEM</div><div><h2>One ecosystem.<br /><em>Four core layers.</em></h2><p className="section-lead">Good infrastructure disappears into the work. It gives builders and users a firm surface to stand on — then gets out of the way.</p><Link href="/about" className="pw-text-link" data-testid="link-intro-about">Our point of view <ArrowRight size={14} /></Link></div></div></section>

    <section className="pw-section pw-products"><div className="pw-container"><div className="section-heading"><div className="section-index">02 <span>/</span> THE STACK</div><h2>Four layers.<br /><em>One coherent experience.</em></h2></div><div className="product-list">{products.map((product) => <article className="product-row" key={product.number}><div className="product-copy"><span className="product-number">{product.number}</span><h3>{product.title}</h3><p>{product.copy}</p><Link href={product.href} className="pw-arrow-link" data-testid={`link-product-${product.number}`}>View layer <ArrowRight size={15} /></Link></div><div className="product-art">{product.visual}</div></article>)}</div></div></section>

    <section className="pw-section pw-builder"><div className="pw-container builder-grid"><div><div className="section-index">03 <span>/</span> BUILT TO EXTEND</div><h2>Primitives for<br /><em>serious builders.</em></h2><p className="section-lead">From a first connection to a production-grade application, PrimeWave keeps the path legible. Explore interfaces, tooling, and a network designed to be understood.</p><Link href="/developers" className="pw-button" data-testid="link-builder-docs">Visit developer hub <ArrowRight size={15} /></Link></div><DeveloperVisual /></div></section>

    <section className="pw-section pw-principles"><div className="pw-container"><div className="section-heading row-heading"><div className="section-index">04 <span>/</span> THE STANDARD</div><h2>Trust is a<br /><em>design constraint.</em></h2></div><div className="principle-grid"><div><ShieldCheck /><h3>Clarity over noise</h3><p>Interfaces and protocols should explain themselves. No theatrics. No hidden layers.</p></div><div><LockKeyhole /><h3>Ownership by default</h3><p>Control stays close to the user, with security considered at every boundary.</p></div><div><Waypoints /><h3>Systems that connect</h3><p>Composable primitives make room for new ideas without asking you to start over.</p></div></div></div></section>

    <section className="pw-section pw-ecosystem-callout"><div className="pw-container ecosystem-band"><div><span className="pw-eyebrow">THE PRIMEWAVE ECOSYSTEM</span><h2>Build the next<br /><em>useful thing.</em></h2></div><div><p>We are assembling the components for an open, durable technology environment. The network is early. The direction is clear.</p><Link href="/ecosystem" className="pw-outline-button" data-testid="link-ecosystem-explore">Explore the ecosystem <ArrowRight size={15} /></Link></div></div></section>
    <section className="pw-final-cta"><div className="pw-container final-cta-inner"><Sparkles size={18} /><h2>Make the future<br /><em>legible.</em></h2><p>Start with the PrimeWave stack.</p><Link href="/login" className="pw-button" data-testid="link-final-launch">Launch App <ArrowUpRight size={16} /></Link></div></section>
  </PublicShell>;
}