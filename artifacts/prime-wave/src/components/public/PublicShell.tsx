import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, Menu, X } from "lucide-react";

const navItems = [
  { href: "/chain", label: "Chain" },
  { href: "/dex", label: "PWDEX" },
  { href: "/swap", label: "PWSwap" },
  { href: "/wallet", label: "Wallet" },
  { href: "/developers", label: "Developers" },
  { href: "/security", label: "Security" },
  { href: "/ecosystem", label: "Ecosystem" },
];

export function PublicMeta({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    document.title = `${title} — PrimeWave`;
    const setMeta = (name: string, content: string) => {
      const selector = name.startsWith("og:") ? `meta[property="${name}"], meta[name="${name}"]` : `meta[name="${name}"]`;
      let tag = document.querySelector(selector) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement("meta");
        if (name.startsWith("og:")) tag.setAttribute("property", name);
        else tag.name = name;
        document.head.appendChild(tag);
      }
      tag.content = content;
    };
    setMeta("description", description);
    setMeta("og:title", `${title} — PrimeWave`);
    setMeta("og:description", description);
  }, [description, title]);
  return null;
}

export default function PublicShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [location]);
  return (
    <div className="pw-site">
      <div className="pw-noise" aria-hidden="true" />
      <header className="pw-header">
        <div className="pw-container pw-nav">
          <Link href="/" className="pw-brand" data-testid="link-brand-home">
            <span className="pw-mark" aria-hidden="true"><i /><i /><i /></span>
            <span>prime<span>·</span>wave</span>
          </Link>
          <nav className={`pw-nav-links ${open ? "is-open" : ""}`} aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={location === item.href ? "active" : ""} data-testid={`link-nav-${item.label.toLowerCase()}`}>
                {item.label}
              </Link>
            ))}
            <Link href="/network" className={location === "/network" ? "active" : ""} data-testid="link-nav-network">Network</Link>
            <Link href="/about" className={location === "/about" ? "active" : ""} data-testid="link-nav-about">About</Link>
          </nav>
          <div className="pw-nav-actions">
            <Link href="/login" className="pw-text-link desktop-only" data-testid="link-nav-login">Sign in <ArrowUpRight size={14} /></Link>
            <Link href="/login" className="pw-button pw-button-small" data-testid="link-nav-launch">Launch App <ArrowUpRight size={14} /></Link>
            <button className="pw-menu-button" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} data-testid="button-mobile-menu">
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="pw-footer">
        <div className="pw-container pw-footer-grid">
          <div>
            <Link href="/" className="pw-brand" data-testid="link-footer-brand">
              <span className="pw-mark" aria-hidden="true"><i /><i /><i /></span>
              <span>prime<span>·</span>wave</span>
            </Link>
            <p className="pw-footer-note">Infrastructure for a decentralized future.</p>
          </div>
          <div className="pw-footer-links">
            <div><span className="pw-eyebrow">Products</span><Link href="/chain" data-testid="link-footer-chain">PrimeWave Chain</Link><Link href="/dex" data-testid="link-footer-dex">PWDEX</Link><Link href="/swap" data-testid="link-footer-swap">PWSwap</Link><Link href="/wallet" data-testid="link-footer-wallet">PrimeWave Wallet</Link></div>
            <div><span className="pw-eyebrow">Explore</span><Link href="/developers" data-testid="link-footer-developers">Developers</Link><Link href="/network" data-testid="link-footer-network">Network</Link><Link href="/security" data-testid="link-footer-security">Security</Link><Link href="/ecosystem" data-testid="link-footer-ecosystem">Ecosystem</Link></div>
            <div><span className="pw-eyebrow">Company</span><Link href="/about" data-testid="link-footer-about">About PrimeWave</Link><Link href="/login" data-testid="link-footer-app">Launch App</Link></div>
          </div>
        </div>
        <div className="pw-container pw-footer-bottom"><span>© {new Date().getFullYear()} PrimeWave Systems</span><span className="pw-mono">SYSTEM STATUS / <b>PREVIEW</b></span></div>
      </footer>
    </div>
  );
}