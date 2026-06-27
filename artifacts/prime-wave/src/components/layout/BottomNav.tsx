import { useLocation, Link } from "wouter";
import { Home, Wallet, TrendingUp, Sparkles, GitFork, User } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  matches: string[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: Home,
    matches: ["/dashboard", "/"],
  },
  {
    label: "Wallets",
    href: "/wallets/deposit",
    icon: Wallet,
    matches: ["/wallets"],
  },
  {
    label: "Invest",
    href: "/investments",
    icon: TrendingUp,
    matches: ["/investments"],
  },
  {
    label: "Income",
    href: "/income",
    icon: Sparkles,
    matches: ["/income"],
  },
  {
    label: "Network",
    href: "/team",
    icon: GitFork,
    matches: ["/team"],
  },
  {
    label: "Profile",
    href: "/settings",
    icon: User,
    matches: ["/settings"],
  },
];

export default function BottomNav() {
  const [location] = useLocation();

  const isActive = (item: NavItem) =>
    item.matches.some(
      (m) => location === m || location.startsWith(m + "/")
    );

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden"
      style={{
        background: "var(--sidebar-bg)",
        borderTop: "1px solid var(--sidebar-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex h-16 items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 relative"
              aria-label={item.label}
            >
              {active && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full"
                  style={{ background: "#D4AF37" }}
                />
              )}
              <Icon
                className="h-5 w-5 transition-colors duration-150"
                style={{ color: active ? "#D4AF37" : "rgba(170,179,197,0.55)" }}
              />
              <span
                className="text-[10px] font-medium leading-none transition-colors duration-150"
                style={{ color: active ? "#D4AF37" : "rgba(170,179,197,0.5)" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
