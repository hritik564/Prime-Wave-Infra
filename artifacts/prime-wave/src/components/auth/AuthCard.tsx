import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/auth/ThemeToggle";

interface AuthCardProps {
  children: React.ReactNode;
  maxWidth?: string;
}

export function AuthCard({ children, maxWidth = "max-w-md" }: AuthCardProps) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden py-12 px-4">
      {/* Decorative background glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
      >
        <div
          className="absolute -top-32 right-0 w-[600px] h-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle at top right, rgba(212,175,55,0.07) 0%, transparent 60%)",
          }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(circle at bottom left, rgba(9,30,69,0.6) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(212,175,55,0.02) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Theme Toggle */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={`relative w-full ${maxWidth}`}
      >
        <div
          className="rounded-2xl p-8 sm:p-10"
          style={{
            background: "hsl(var(--card))",
            border: "1px solid rgba(212,175,55,0.12)",
            boxShadow:
              "0 25px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,55,0.06)",
          }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}
