import { Link, useLocation } from "wouter";

const TABS = [
  { label: "Active",   href: "/investments" },
  { label: "History",  href: "/investments/history" },
];

export default function InvestmentTabs() {
  const [location] = useLocation();

  return (
    <div
      className="flex gap-1 p-1 rounded-xl mb-5 lg:mb-6 w-full"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
    >
      {TABS.map((tab) => {
        const active = location === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex-1 text-center py-2.5 rounded-lg text-sm font-semibold transition-all duration-200"
            style={
              active
                ? {
                    background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
                    color: "#0E1B37",
                    boxShadow: "0 2px 8px rgba(212,175,55,0.3)",
                  }
                : { color: "hsl(var(--muted-foreground))" }
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
