import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/providers/AuthProvider";
import {
  LayoutDashboard, Users, TrendingUp, ArrowDownLeft, Wallet,
  GitBranch, Zap, Package, BarChart2, FileText, Headphones,
  Settings, LogOut, Bell, Search, Activity, Menu, X, Shield,
  ArrowRight, ArrowDownToLine, FlaskConical, Wifi,
} from "lucide-react";
import { adminSearchUsers, type AdminUserListItem } from "@/lib/api";
import { SkeletonStyle, Skeleton } from "@/components/admin/Skeleton";
import { useResponsive } from "@/hooks/useResponsive";

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
      { icon: Users,           label: "Members",        path: "/admin/members" },
      { icon: TrendingUp,      label: "Investments",    path: "/admin/investments" },
      { icon: ArrowDownToLine, label: "Deposits",       path: "/admin/deposits" },
      { icon: Wifi,            label: "Auto Deposits",  path: "/admin/auto-deposits" },
      { icon: ArrowDownLeft,   label: "Withdrawals",    path: "/admin/withdrawals" },
      { icon: Wallet,          label: "Wallets",        path: "/admin/wallets" },
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
      { icon: BarChart2,     label: "Reports",   path: "/admin/reports"  },
      { icon: FileText,      label: "CMS",       path: "/admin/cms"      },
      { icon: Headphones,    label: "Support",   path: "/admin/support"  },
      { icon: Settings,      label: "Settings",  path: "/admin/settings" },
    ],
  },
  {
    label: "DEVELOPER",
    items: [
      { icon: FlaskConical, label: "Dev Tools", path: "/dev-tools" },
    ],
  },
];

export const SidebarItem = memo(function SidebarItem({
  icon: Icon, label, path, active, collapsed, onNavigate,
}: {
  icon: React.ElementType; label: string; path: string;
  active: boolean; collapsed: boolean; onNavigate?: () => void;
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

  const navigate = useCallback(() => {
    setLocation(path);
    onNavigate?.();
  }, [setLocation, path, onNavigate]);

  return (
    <div
      ref={ref}
      onClick={navigate}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      title={collapsed ? label : undefined}
      role="menuitem"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate(); }}
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
        outline: "none",
      }}
    >
      <Icon size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
      {!collapsed && (
        <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 400, letterSpacing: "0.01em" }}>
          {label}
        </span>
      )}
    </div>
  );
});

/* ── Global search overlay ──────────────────────────────────────────────────── */

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const GlobalSearch = memo(function GlobalSearch({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<AdminUserListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused,  setFocused]  = useState(-1);
  const inputRef   = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  const debounced  = useDebounce(query, 250);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setFocused(-1);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!debounced.trim()) { setResults([]); return; }
    setSearching(true);
    const params = debounced.includes("@")
      ? { email: debounced }
      : /^\+?\d{6,}/.test(debounced)
        ? { phone: debounced }
        : { username: debounced };
    adminSearchUsers(params)
      .then(r => setResults(r.data.slice(0, 8)))
      .catch(() => {})
      .finally(() => setSearching(false));
  }, [debounced]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setFocused(f => Math.min(f + 1, results.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setFocused(f => Math.max(f - 1, -1)); }
      if (e.key === "Enter" && focused >= 0 && results[focused]) {
        setLocation("/admin/members");
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, focused, results, onClose, setLocation]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        style={{
          position: "fixed", top: "14%", left: "50%", transform: "translateX(-50%)",
          zIndex: 501, width: 580, maxWidth: "calc(100vw - 32px)",
          background: "hsl(222 62% 10%)", border: `1px solid ${BORDER}`,
          borderRadius: 16, boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderBottom: `1px solid ${BORDER}` }}>
          <Search size={16} style={{ color: MUTED, flexShrink: 0 }} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setFocused(-1); }}
            placeholder="Search members by username, email, phone…"
            aria-label="Search"
            style={{
              flex: 1, background: "none", border: "none", outline: "none",
              fontSize: 14, color: "rgba(255,255,255,0.9)",
            }}
          />
          {searching && (
            <Activity size={13} style={{ color: MUTED, animation: "spin 1s linear infinite", flexShrink: 0 }} />
          )}
          <kbd style={{ fontSize: 10, color: MUTED, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "2px 6px", flexShrink: 0 }}>Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 360, overflowY: "auto" }}>
          {!query.trim() && (
            <div style={{ padding: "24px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>Search across members, transactions, and more</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {["username", "email", "phone"].map(hint => (
                  <span key={hint} style={{ fontSize: 11, color: MUTED, background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 10px" }}>
                    {hint}
                  </span>
                ))}
              </div>
            </div>
          )}

          {query.trim() && searching && results.length === 0 && (
            <div style={{ padding: "12px 0" }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "12px 18px", alignItems: "center" }}>
                  <Skeleton width={32} height={32} borderRadius={8} />
                  <div style={{ flex: 1 }}>
                    <Skeleton width="40%" height={12} style={{ marginBottom: 6 }} />
                    <Skeleton width="60%" height={10} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {query.trim() && !searching && results.length === 0 && (
            <div style={{ padding: "32px 18px", textAlign: "center", fontSize: 13, color: MUTED }}>
              No results for "{query}"
            </div>
          )}

          {results.length > 0 && (
            <div>
              <div style={{ padding: "10px 18px 4px", fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: "0.1em" }}>
                MEMBERS ({results.length})
              </div>
              {results.map((u, i) => (
                <div
                  key={u.id}
                  onClick={() => { setLocation("/admin/members"); onClose(); }}
                  onMouseEnter={() => setFocused(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 18px", cursor: "pointer",
                    background: focused === i ? "rgba(255,255,255,0.05)" : "transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: "rgba(212,175,55,0.1)", border: "1.5px solid rgba(212,175,55,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: GOLD_L,
                  }}>
                    {(u.firstName?.[0] ?? u.username[0]).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginBottom: 2 }}>
                      @{u.username}
                      {u.firstName && <span style={{ fontWeight: 400, color: MUTED }}> — {u.firstName} {u.lastName ?? ""}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700,
                      color: u.status === "ACTIVE" ? "#34d399" : u.status === "SUSPENDED" ? "#f87171" : MUTED,
                      background: u.status === "ACTIVE" ? "rgba(52,211,153,0.12)" : u.status === "SUSPENDED" ? "rgba(248,113,113,0.12)" : "rgba(170,179,197,0.08)",
                      padding: "2px 7px", borderRadius: 4,
                    }}>{u.status}</span>
                    <ArrowRight size={12} style={{ color: MUTED }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 16 }}>
          {[["↑↓", "navigate"], ["↵", "open"], ["esc", "close"]].map(([key, label]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <kbd style={{ fontSize: 10, color: MUTED, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "1px 5px" }}>{key}</kbd>
              <span style={{ fontSize: 10, color: MUTED }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
});

/* ── Top navbar ─────────────────────────────────────────────────────────────── */

function TopNavbar({
  sidebarOpen, onToggle, onSearchOpen, isMobile,
}: { sidebarOpen: boolean; onToggle: () => void; onSearchOpen: () => void; isMobile: boolean }) {
  const [time, setTime] = useState(() => new Date());
  const [health] = useState<"ok" | "warn">("ok");

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fmt     = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtDate = time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  return (
    <div style={{
      height: 52, display: "flex", alignItems: "center",
      padding: "0 16px", gap: isMobile ? 8 : 12,
      borderBottom: `1px solid ${BORDER}`,
      background: "hsl(222 62% 6%)",
      position: "sticky", top: 0, zIndex: 30,
      flexShrink: 0,
    }}>
      <button
        onClick={onToggle}
        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: MUTED, padding: 4, borderRadius: 6, display: "flex",
          alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        {isMobile
          ? <Menu size={18} />
          : sidebarOpen ? <X size={16} /> : <Menu size={16} />
        }
      </button>

      {/* Search trigger */}
      <button
        onClick={onSearchOpen}
        aria-label="Open global search (⌘K)"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
          borderRadius: 7, padding: "5px 10px",
          flex: isMobile ? 1 : "0 0 auto",
          width: isMobile ? undefined : 280,
          cursor: "text", textAlign: "left",
        }}
      >
        <Search size={13} style={{ color: MUTED, flexShrink: 0 }} aria-hidden="true" />
        <span style={{ fontSize: 12, color: MUTED, flex: 1 }}>
          {isMobile ? "Search…" : "Search members, transactions…"}
        </span>
        {!isMobile && (
          <kbd style={{ fontSize: 10, color: MUTED, flexShrink: 0, fontFamily: "monospace", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "1px 5px" }}>⌘K</kbd>
        )}
      </button>

      <div style={{ flex: 1 }} />

      {/* System status — hidden on mobile */}
      {!isMobile && (
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
          }} aria-hidden="true" />
          <span style={{ fontSize: 11, color: health === "ok" ? "#34d399" : "#fbbf24", fontWeight: 600 }}>
            All Systems
          </span>
        </div>
      )}

      {/* Time — hidden on mobile */}
      {!isMobile && (
        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>{fmt}</span>
          <span style={{ fontSize: 10, color: MUTED }}>{fmtDate}</span>
        </div>
      )}

      {/* Notification bell */}
      <div style={{ position: "relative", cursor: "pointer" }} role="button" aria-label="Notifications">
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
      }} aria-label="Admin menu" role="button">
        <Shield size={14} style={{ color: GOLD }} />
      </div>
    </div>
  );
}

/* ── Sidebar inner content (shared by desktop + mobile overlay) ─────────────── */

function SidebarContent({
  location, collapsed, onNavigate, onLogout,
}: {
  location: string; collapsed: boolean; onNavigate: () => void; onLogout: () => void;
}) {
  return (
    <>
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
          <div key={group.label} style={{ marginBottom: 8 }} role="group" aria-label={group.label}>
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
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Logout */}
      <div style={{ padding: collapsed ? "8px 4px" : "8px 8px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div
          role="button"
          tabIndex={0}
          aria-label="Logout"
          style={{
            display: "flex", alignItems: "center", gap: 9,
            padding: collapsed ? "9px 0" : "9px 12px",
            justifyContent: collapsed ? "center" : "flex-start",
            borderRadius: 7, cursor: "pointer", color: MUTED,
            transition: "all 0.15s", outline: "none",
          }}
          onClick={onLogout}
          onKeyDown={e => { if (e.key === "Enter") onLogout(); }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.color = "#f87171";
            (e.currentTarget as HTMLDivElement).style.background = "rgba(248,113,113,0.06)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.color = MUTED;
            (e.currentTarget as HTMLDivElement).style.background = "transparent";
          }}
        >
          <LogOut size={14} style={{ flexShrink: 0 }} aria-hidden="true" />
          {!collapsed && <span style={{ fontSize: 12.5, fontWeight: 400 }}>Logout</span>}
        </div>
      </div>
    </>
  );
}

/* ── Layout ─────────────────────────────────────────────────────────────────── */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location]    = useLocation();
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);
  const { authLogout } = useAuth();
  const { isMobile }  = useResponsive();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggle = useCallback(() => {
    if (isMobile) {
      setMobileOpen(o => !o);
    } else {
      setCollapsed(c => !c);
    }
  }, [isMobile]);

  const closeMobile  = useCallback(() => setMobileOpen(false), []);
  const handleLogout = useCallback(() => { authLogout(); }, [authLogout]);

  const sidebarW = collapsed ? 52 : 210;

  return (
    <>
      <SkeletonStyle />
      <div style={{ display: "flex", height: "100dvh", background: "hsl(222 62% 7%)", overflow: "hidden" }}>

        {/* ── Desktop sidebar (in-flow) ───────────────────────────────────── */}
        {!isMobile && (
          <aside
            role="navigation"
            aria-label="Admin navigation"
            style={{
              width: sidebarW, flexShrink: 0,
              background: BG_SIDEBAR,
              borderRight: `1px solid ${BORDER}`,
              display: "flex", flexDirection: "column",
              transition: "width 0.2s ease",
              overflowY: "auto", overflowX: "hidden",
            }}
          >
            <SidebarContent
              location={location}
              collapsed={collapsed}
              onNavigate={closeMobile}
              onLogout={handleLogout}
            />
          </aside>
        )}

        {/* ── Main area ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <TopNavbar
            sidebarOpen={isMobile ? mobileOpen : !collapsed}
            onToggle={toggle}
            onSearchOpen={() => setSearchOpen(true)}
            isMobile={isMobile}
          />
          <main style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px 14px" : "20px 24px" }} id="main-content">
            {children}
          </main>
        </div>

        {/* ── Mobile overlay sidebar ─────────────────────────────────────── */}
        {isMobile && (
          <>
            {/* Backdrop */}
            <div
              aria-hidden="true"
              onClick={closeMobile}
              style={{
                position: "fixed", inset: 0, zIndex: 299,
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(2px)",
                opacity: mobileOpen ? 1 : 0,
                pointerEvents: mobileOpen ? "auto" : "none",
                transition: "opacity 0.22s ease",
              }}
            />
            {/* Drawer */}
            <aside
              role="navigation"
              aria-label="Admin navigation"
              aria-hidden={!mobileOpen}
              style={{
                position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 300,
                width: 240,
                background: BG_SIDEBAR,
                borderRight: `1px solid ${BORDER}`,
                display: "flex", flexDirection: "column",
                overflowY: "auto", overflowX: "hidden",
                transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.24s cubic-bezier(0.32,0.72,0,1)",
                boxShadow: mobileOpen ? "8px 0 40px rgba(0,0,0,0.5)" : "none",
              }}
            >
              <SidebarContent
                location={location}
                collapsed={false}
                onNavigate={closeMobile}
                onLogout={handleLogout}
              />
            </aside>
          </>
        )}
      </div>

      {/* Global search overlay */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
