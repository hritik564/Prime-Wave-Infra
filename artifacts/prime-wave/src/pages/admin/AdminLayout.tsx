import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Users, TrendingUp, ArrowDownLeft, Wallet,
  GitBranch, Zap, Package, BarChart2, FileText, Headphones,
  Settings, LogOut, Bell, Search, Activity, Menu, X, Shield,
} from "lucide-react";

const GOLD   = "#D4AF37";
const GOLD_L = "#F3D37A";
const MUTED  = "rgba(170,179,197,0.48)";
const BORDER = "rgba(255,255,255,0.07)";
const BG_SIDEBAR = "hsl(222 62% 5%)";

const NAV_GROUPS = [
  {
    label: "OVERVIEW",
    items: [
      { icon: LayoutDashboard, label: "Dashboard",      path: "/admin" },
    ],
  },
  {
    label: "MANAGEMENT",
    items: [
      { icon: Users,         label: "Members",        path: "/admin/members" },
      { icon: TrendingUp,    label: "Investments",    path: "/admin/investments" },
      { icon: ArrowDownLeft, label: "Withdrawals",    path: "/admin/withdrawals" },
      { icon: Wallet,        label: "Wallets",        path: "/admin/wallets" },
    ],
  },
  {
    label: "ENGINE",
    items: [
      { icon: GitBranch, label: "Binary Network", path: "/admin/binary" },
      { icon: Zap,       label: "Income Engine",  path: "/admin/income" },
      { icon: Package,   label: "Plans",           path: "/admin/plans" },
    ],
  },
  {
    label: "PLATFORM",
    items: [
      { icon: BarChart2,  label: "Reports",  path: "/admin/reports" },
      { icon: FileText,   label: "CMS",      path: "/admin/cms" },
      { icon: Headphones, label: "Support",  path: "/admin/support" },
      { icon: Settings,   label: "Settings", path: "/admin/settings" },
    ],
  },
];

export const SidebarItem = memo(function SidebarItem({
  icon: Icon, label, path, active, collapsed,
}: {
  icon: React.ElementType; label: string; path: string;
  active: boolean; collapsed: boolean;
}) {
  const [, setLocation] = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  const onEnter = useCallback(() => {
    if (!active && ref.current) {
      ref.current.style.background = "rgba(255,255,255,0.04)";
      ref.current.style.color = "rgba(255,255,255,0.7)";
    }
  }, [active]);
  const onLeave = useCallback(() => {
    if (!active && ref.current) {
      ref.current.style.background = "transparent";
      ref.current.style.color = MUTED;
    }
  }, [active]);

  return (
    <div
      ref={ref}
      onClick={() => setLocation(path)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      title={collapsed ? label : undefined}
      style={{
        display: "flex", alignItems: "center",
        gap: collapsed ? 0 : 9,
        padding: collapsed ? "9px 0" : "9px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 7, cursor: "pointer", marginBottom: 1,
        background: active ? "rgba(212,175,55,0.09)" : "transparent",
        borderLeft: active ? `2px solid ${GOLD}` : "2px solid transparent",
        color: active ? GOLD_L : MUTED,
        transition: "background 0.15s,color 0.15s",
      }}
    >
      <Icon size={14} style={{ flexShrink: 0 }} />
      {!collapsed && (
        <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, letterSpacing: "0.01em" }}>
          {label}
        </span>
      )}
    </div>
  );
});

function TopNavbar({ sidebarOpen, onToggle }: { sidebarOpen: boolean; onToggle: () => void }) {
  const [time, setTime] = useState(() => new Date());
  const [health] = useState<"ok" | "warn">("ok");

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtDate = time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div style={{
      height: 52, display: "flex", alignItems: "center",
      padding: "0 20px", gap: 12,
      borderBottom: `1px solid ${BORDER}`,
      background: "hsl(222 62% 6%)",
      position: "sticky", top: 0, zIndex: 30,
      flexShrink: 0,
    }}>
      <button
        onClick={onToggle}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: MUTED, padding: 4, borderRadius: 6, display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
      </button>

      {/* Search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
        borderRadius: 7, padding: "5px 10px", flex: 1, maxWidth: 320,
      }}>
        <Search size={13} style={{ color: MUTED, flexShrink: 0 }} />
        <input
          placeholder="Search members, transactions..."
          style={{
            background: "none", border: "none", outline: "none",
            fontSize: 12, color: "rgba(255,255,255,0.7)", width: "100%",
          }}
        />
        <span style={{ fontSize: 10, color: MUTED, flexShrink: 0, fontFamily: "monospace" }}>⌘K</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* System status */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        background: health === "ok" ? "rgba(52,211,153,0.08)" : "rgba(251,191,36,0.08)",
        border: `1px solid ${health === "ok" ? "rgba(52,211,153,0.2)" : "rgba(251,191,36,0.2)"}`,
        borderRadius: 6, padding: "4px 9px",
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: health === "ok" ? "#34d399" : "#fbbf24",
          boxShadow: health === "ok" ? "0 0 6px #34d39970" : "0 0 6px #fbbf2470",
        }} />
        <span style={{ fontSize: 11, color: health === "ok" ? "#34d399" : "#fbbf24", fontWeight: 600 }}>
          {health === "ok" ? "All Systems" : "Degraded"}
        </span>
      </div>

      {/* Time */}
      <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>{fmt}</span>
        <span style={{ fontSize: 10, color: MUTED }}>{fmtDate}</span>
      </div>

      {/* Notification bell */}
      <div style={{ position: "relative", cursor: "pointer" }}>
        <Bell size={16} style={{ color: MUTED }} />
        <div style={{
          position: "absolute", top: -4, right: -4,
          width: 14, height: 14, borderRadius: "50%",
          background: GOLD, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 8, fontWeight: 800, color: "#0E1B37",
        }}>7</div>
      </div>

      {/* Admin avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: "rgba(212,175,55,0.12)",
        border: `1.5px solid rgba(212,175,55,0.3)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
      }}>
        <Shield size={14} style={{ color: GOLD }} />
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => setCollapsed(c => !c), []);
  const sidebarW = collapsed ? 52 : 210;

  return (
    <div style={{ display: "flex", height: "100vh", background: "hsl(222 62% 7%)", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarW, flexShrink: 0,
        background: BG_SIDEBAR,
        borderRight: `1px solid ${BORDER}`,
        display: "flex", flexDirection: "column",
        transition: "width 0.2s ease",
        overflowY: "auto", overflowX: "hidden",
      }}>
        {/* Brand */}
        <div style={{
          height: 52, display: "flex", alignItems: "center",
          padding: collapsed ? "0" : "0 16px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
          gap: 8,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: "rgba(212,175,55,0.15)",
            border: `1px solid rgba(212,175,55,0.3)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: GOLD }}>PW</span>
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GOLD_L, lineHeight: 1.2 }}>Prime Wave</div>
              <div style={{ fontSize: 9, color: MUTED, letterSpacing: "0.08em" }}>CONTROL CENTER</div>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <div style={{ flex: 1, padding: collapsed ? "8px 4px" : "8px 8px", overflowY: "auto" }}>
          {NAV_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 8 }}>
              {!collapsed && (
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                  color: "rgba(170,179,197,0.28)", padding: "6px 12px 4px",
                }}>{group.label}</div>
              )}
              {group.items.map(item => (
                <SidebarItem
                  key={item.path}
                  icon={item.icon}
                  label={item.label}
                  path={item.path}
                  active={location === item.path}
                  collapsed={collapsed}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Logout */}
        <div style={{ padding: collapsed ? "8px 4px" : "8px 8px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 9,
              padding: collapsed ? "9px 0" : "9px 12px",
              justifyContent: collapsed ? "center" : "flex-start",
              borderRadius: 7, cursor: "pointer", color: MUTED,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.color = "#f87171";
              (e.currentTarget as HTMLDivElement).style.background = "rgba(248,113,113,0.06)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.color = MUTED;
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            <LogOut size={14} style={{ flexShrink: 0 }} />
            {!collapsed && <span style={{ fontSize: 12.5, fontWeight: 400 }}>Logout</span>}
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <TopNavbar sidebarOpen={!collapsed} onToggle={toggle} />
        <main style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
