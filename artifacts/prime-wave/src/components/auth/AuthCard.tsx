import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/auth/ThemeToggle";

interface AuthCardProps {
  children: React.ReactNode;
  maxWidth?: string;
  centerOnMobile?: boolean;
}

export function AuthCard({
  children,
  maxWidth = "max-w-md",
  centerOnMobile = false,
}: AuthCardProps) {
  return (
    <main className="auth-shell">
      <div className="auth-grid" aria-hidden="true" />
      <div className="auth-glow auth-glow-top" aria-hidden="true" />
      <div className="auth-glow auth-glow-bottom" aria-hidden="true" />
      <div className="auth-orbit auth-orbit-primary" aria-hidden="true" />
      <div className="auth-orbit auth-orbit-secondary" aria-hidden="true" />
      <div className="auth-orbit auth-orbit-tertiary" aria-hidden="true" />
      <span className="auth-node auth-node-one" aria-hidden="true" />
      <span className="auth-node auth-node-two" aria-hidden="true" />
      <span className="auth-node auth-node-three" aria-hidden="true" />

      <div className="auth-topbar">
        <div className="auth-system-meta" aria-hidden="true">
          <span>AI × BLOCKCHAIN × A BETTER TOMORROW</span>
          <i />
        </div>
      </div>

      <div className="fixed right-4 top-4 z-50 sm:right-7 sm:top-7">
        <ThemeToggle className="auth-theme-toggle" />
      </div>

      <div className="auth-side-note auth-side-note-left" aria-hidden="true">
        <span className="auth-side-rule" />
        <span>INTELLIGENCE<br />POWERS<br />PROGRESS</span>
      </div>
      <div className="auth-side-note auth-side-note-right" aria-hidden="true">
        <span className="auth-side-rule" />
        <span>AI-POWERED<br />INFRASTRUCTURE<br />FOR A DECENTRALIZED<br />FUTURE.</span>
      </div>

      <div className={`auth-content${centerOnMobile ? " auth-content-centered-mobile" : ""}`}>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className={`auth-card-shell relative w-full ${maxWidth}`}
        >
          <div className="auth-card">
            <div className="pw-brand auth-card-brand" aria-label="PrimeWave">
              <span className="pw-mark" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>prime<span>·</span>wave</span>
            </div>
            {children}
          </div>
        </motion.div>
      </div>

      <div className="auth-footer-meta auth-footer-meta-left" aria-hidden="true">
        <span className="auth-side-rule" /> PRIMEWAVE ECOSYSTEM
      </div>
      <div className="auth-footer-meta auth-footer-meta-right" aria-hidden="true">
        <i /> SECURE ACCESS
      </div>
    </main>
  );
}
