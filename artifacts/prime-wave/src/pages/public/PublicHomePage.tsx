import { ArrowDownRight, ArrowRight, ArrowUpRight, ExternalLink, LockKeyhole, ShieldCheck, Sparkles, Waypoints } from "lucide-react";
import { Link } from "wouter";
import PublicShell, { PublicMeta } from "@/components/public/PublicShell";
import { DeveloperVisual, DexVisual, NetworkVisual, SecurityVisual, SwapVisual, WalletVisual } from "@/components/public/ProductVisuals";

const products = [
  { number: "01", title: "PrimeWave Chain", category: "BLOCKCHAIN INFRASTRUCTURE", copy: "The foundation for PrimeWave applications and the decentralized infrastructure they run on.", href: "https://pwcscan.com", cta: "Explore Chain", external: true, visual: <NetworkVisual /> },
  { number: "02", title: "PWDEX", category: "DECENTRALIZED MARKETS", copy: "A decentralized market interface designed for on-chain trading and liquidity.", href: "https://dex.primewave.live", cta: "Launch PWDEX", external: true, visual: <DexVisual /> },
  { number: "03", title: "PWSwap", category: "ASSET EXCHANGE", copy: "A streamlined exchange experience being built for the PrimeWave ecosystem.", cta: "Coming Soon", visual: <SwapVisual /> },
  { number: "04", title: "PrimeWave Wallet", category: "SELF-CUSTODY", copy: "A self-custody wallet being built to connect users with the PrimeWave ecosystem.", cta: "Coming Soon", visual: <WalletVisual /> },
];

function ProductCta({ product }: { product: typeof products[number] }) {
  if (!product.cta) return null;
  if (product.external) {
    return <a href={product.href} target="_blank" rel="noopener noreferrer" className="pw-arrow-link" data-testid={`link-product-${product.number}`}>{product.cta} <ExternalLink size={14} /></a>;
  }
  return <span className="pw-arrow-link pw-disabled-link" aria-label={`${product.title} is coming soon`}>{product.cta}</span>;
}

export default function PublicHomePage() {
  return <PublicShell>
    <PublicMeta title="PrimeWave — Intelligent Infrastructure for a Decentralized Future" description="PrimeWave is building an intelligent Web3 ecosystem combining blockchain infrastructure, decentralized markets, asset exchange, self-custody, and intelligent applications." />
    <section className="pw-hero">
      <div className="pw-hero-grid" />
      <div className="pw-container pw-hero-content">
        <div className="pw-kicker"><span className="kicker-line" /> PRIMEWAVE SYSTEMS <span className="pw-mono">/ 001</span></div>
         <h1>Intelligent infrastructure<br /><span>for a decentralized</span><br />future.</h1>
          <p className="pw-hero-copy">PrimeWave brings intelligent software, blockchain infrastructure, decentralized markets, asset exchange, and self-custody together in one evolving ecosystem.</p>
         <div className="pw-hero-actions"><Link href="/ecosystem" className="pw-button" data-testid="link-hero-ecosystem">Explore the Ecosystem <ArrowRight size={16} /></Link><Link href="/login" className="pw-outline-button" data-testid="link-hero-launch">Launch App <ArrowDownRight size={16} /></Link></div>
        <div className="pw-hero-foot"><span className="pw-mono">SYSTEMS DESIGNED TO COMPOSE</span><span className="hero-scroll"><span /> scroll to explore</span></div>
      </div>
      <div className="pw-hero-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><span>PW</span></div><i className="orbit-point point-a" /><i className="orbit-point point-b" /><i className="orbit-point point-c" /></div>
    </section>

     <section className="pw-section pw-intro"><div className="pw-container intro-grid"><div className="section-index">01 <span>/</span> THE ECOSYSTEM</div><div><h2>One ecosystem.<br /><em>Four connected products.</em></h2><p className="section-lead">PrimeWave combines blockchain infrastructure, decentralized markets, asset exchange, and self-custody with intelligent software experiences designed to make the system easier to understand.</p><Link href="/about" className="pw-text-link" data-testid="link-intro-about">Our point of view <ArrowRight size={14} /></Link></div></div></section>

    <section className="pw-section pw-products"><div className="pw-container"><div className="section-heading"><div className="section-index">02 <span>/</span> OUR PRODUCTS</div><h2>Four connected products.<br /><em>One coherent experience.</em></h2></div><div className="product-list">{products.map((product) => <article className="product-row" key={product.number}><div className="product-copy"><span className="product-number">{product.number}</span><span className="product-category">{product.category}</span><h3>{product.title}</h3><p>{product.copy}</p><ProductCta product={product} /></div><div className="product-art">{product.visual}</div></article>)}</div></div></section>

    <section className="pw-section pw-intelligence"><div className="pw-container"><div className="section-heading row-heading"><div className="section-index">03 <span>/</span> INTELLIGENCE</div><div><h2>Intelligence, built<br /><em>into the experience.</em></h2><p className="section-lead">PrimeWave is exploring how intelligent software can make decentralized technology easier to understand, interact with, and build upon.</p></div></div><div className="principle-grid"><div><span className="feature-number">01</span><h3>Intelligent interfaces</h3><p>Interfaces designed to make complex decentralized systems easier to navigate and understand.</p></div><div><span className="feature-number">02</span><h3>Connected infrastructure</h3><p>AI and blockchain working together as complementary directions in a broader technology stack.</p></div><div><span className="feature-number">03</span><h3>Intelligent applications</h3><p>An ecosystem designed to support the next generation of decentralized applications.</p></div></div></div></section>

    <section className="pw-section pw-builder"><div className="pw-container builder-grid"><div><div className="section-index">04 <span>/</span> BUILT TO EXTEND</div><h2>Build what<br /><em>comes next.</em></h2><p className="section-lead">PrimeWave is building the infrastructure and interfaces developers need to create the next generation of decentralized and intelligent applications.</p><Link href="/developers" className="pw-button" data-testid="link-builder-docs">Visit developer hub <ArrowRight size={15} /></Link></div><DeveloperVisual /></div></section>

    <section className="pw-section pw-principles"><div className="pw-container"><div className="section-heading row-heading"><div className="section-index">05 <span>/</span> THE STANDARD</div><h2>Trust is a<br /><em>design constraint.</em></h2></div><div className="principle-grid"><div><ShieldCheck /><h3>Clarity over noise</h3><p>Interfaces and protocols should explain themselves. No theatrics. No hidden layers.</p></div><div><LockKeyhole /><h3>Ownership by default</h3><p>Control stays close to the user, with secure transaction handling considered at every boundary.</p></div><div><Waypoints /><h3>Systems that connect</h3><p>Composable primitives make room for new ideas while minimizing unnecessary trust assumptions.</p></div></div></div></section>

    <section className="pw-section pw-ecosystem-callout"><div className="pw-container ecosystem-band"><div><span className="pw-eyebrow">THE PRIMEWAVE ECOSYSTEM</span><h2>Build the next<br /><em>useful thing.</em></h2></div><div><p>We are assembling the components for an open, durable technology environment. The network is early. The direction is clear.</p><Link href="/ecosystem" className="pw-outline-button" data-testid="link-ecosystem-explore">Explore the ecosystem <ArrowRight size={15} /></Link></div></div></section>
    <section className="pw-final-cta"><div className="pw-container final-cta-inner"><Sparkles size={18} /><h2>Make the future<br /><em>legible.</em></h2><p>Start with the PrimeWave stack.</p><Link href="/login" className="pw-button" data-testid="link-final-launch">Launch App <ArrowUpRight size={16} /></Link></div></section>
  </PublicShell>;
}