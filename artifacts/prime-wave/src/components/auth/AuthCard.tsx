import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/auth/ThemeToggle";

interface AuthCardProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export function AuthCard({ children, maxWidth = "max-w-md" }: AuthCardProps) {
  return (
    <main className="auth-shell">
      <div className="auth-grid" aria-hidden="true" />
      <div className="auth-glow auth-glow-top" aria-hidden="true" />
      <div className="auth-glow auth-glow-bottom" aria-hidden="true" />
      <div className="auth-wave auth-wave-one" aria-hidden="true" />
      <div className="auth-wave auth-wave-two" aria-hidden="true" />
      <div className="auth-wave auth-wave-three" aria-hidden="true" />

      <div className="auth-corner-label auth-corner-label-top" aria-hidden="true">
        PRIMEWAVE / ACCESS
      </div>
      <div className="auth-corner-label auth-corner-label-bottom" aria-hidden="true">
        SYSTEM / ONLINE
      </div>

      <div className="fixed right-4 top-4 z-50 sm:right-7 sm:top-7">
        <ThemeToggle className="auth-theme-toggle" />
      </div>

      <div className="auth-content">
        <div className="auth-brand" aria-label="PrimeWave">
          <span className="auth-brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            Prime<span>Wave</span>
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className={`auth-card-shell relative w-full ${maxWidth}`}
        >
          <div className="auth-card">{children}</div>
        </motion.div>
      </div>
    </main>
  );
}
