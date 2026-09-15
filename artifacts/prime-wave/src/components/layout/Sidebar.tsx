"use client";

import { useLocation, Link } from "wouter";
import { useEffect, useState } from "react";
import { X, User, ChevronRight } from "lucide-react";
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  PiggyBank,
  ArrowDownToLine,
  GitFork,
  Users,
  Sparkles,
  Bell,
  Settings,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/providers/AuthProvider";
import { getActiveStatus, type ActiveStatus } from "@/lib/api";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { label: "Investments",       href: "/investments",       icon: TrendingUp },
      { label: "Deposit Wallet",    href: "/wallets/deposit",   icon: Wallet },
      { label: "Income Wallet",     href: "/wallets/income",    icon: PiggyBank },
      { label: "Withdrawal Wallet", href: "/wallets/withdrawal", icon: ArrowDownToLine },
    ],
  },
  {
    label: "Network",
    items: [
      { label: "Network Intelligence", href: "/team", icon: GitFork },
    ],
  },
  {
    label: "Income",
    items: [
      { label: "Income Center",              href: "/income",        icon: Sparkles },
      { label: "Financial Transparency",     href: "/transparency",  icon: FlaskConical },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Notifications", href: "/notifications", icon: Bell },
      { label: "Settings",      href: "/settings",      icon: Settings },
    ],
  },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user }   = useAuth();
  const [status, setStatus] = useState<ActiveStatus | null>(null);

  useEffect(() => {
    getActiveStatus()
      .then(setStatus)
      .catch(() => {/* silently fail */});
  }, []);

  return (
    <div
      className="flex h-full flex-col"
      style={{
        backgroundColor: "var(--sidebar-bg)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
            style={{
              background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
            }}
          >
            <span className="text-xs font-bold" style={{ color: "#0E1B37" }}>
              PW
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white leading-none">
              Prime Wave
            </span>
            <span
              className="text-[10px] leading-tight tracking-wider uppercase"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              Platform
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden rounded-md p-1 transition-colors"
            style={{ color: "hsl(var(--muted-foreground))" }}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Divider */}
      <div
        className="mx-4 mb-2"
        style={{ height: "1px", background: "var(--sidebar-border)" }}
      />

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-2">
        <nav className="space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p
                className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "rgba(170, 179, 197, 0.5)" }}
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    location === item.href ||
                    (item.href !== "/dashboard" &&
                      location.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-all duration-150",
                          isActive
                            ? "sidebar-active font-medium"
                            : "border-l-2 border-transparent hover:bg-white/5",
                        )}
                        style={
                          isActive
                            ? undefined
                            : { color: "hsl(var(--muted-foreground))" }
                        }
                      >
                        <Icon
                          className="h-4 w-4 shrink-0"
                          style={{ color: isActive ? "#D4AF37" : undefined }}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Dev Toolkit link — development only */}
      {import.meta.env.DEV && (
        <div className="px-3 pb-2">
          <Link
            href="/dev-tools"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-xs font-semibold transition-all duration-150"
            style={{
              background: "rgba(234,88,12,0.1)",
              border: "1px solid rgba(234,88,12,0.25)",
              color: "#fb923c",
            }}
          >
            <FlaskConical className="h-3.5 w-3.5 shrink-0" />
            Dev Toolkit
          </Link>
        </div>
      )}

      {/* Profile + Active Status section */}
      <div className="px-3 pb-3">
        {/* Divider */}
        <div className="mb-3" style={{ height: "1px", background: "var(--sidebar-border)" }} />

        {/* Profile row — links to Settings */}
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150 hover:bg-white/5 group"
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.2)" }}
          >
            <User className="h-4 w-4" style={{ color: "#D4AF37" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-none truncate">
              {user?.firstName && user?.lastName
                ? `${user.firstName} ${user.lastName}`
                : (user?.username ?? "My Account")}
            </p>
            <p className="text-[10px] mt-0.5 truncate" style={{ color: "hsl(var(--muted-foreground))" }}>
              {user?.email ?? "View profile"}
            </p>
          </div>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "hsl(var(--muted-foreground))" }} />
        </Link>

        {/* Active / Inactive status pill */}
        <div
          className="mt-2 flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
            Member Status
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
            style={
              status?.isActive
                ? { background: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.25)" }
                : { background: "rgba(248,113,113,0.10)", color: "#f87171", border: "1px solid rgba(248,113,113,0.22)" }
            }
          >
            {status === null ? "…" : status.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>
    </div>
  );
}
