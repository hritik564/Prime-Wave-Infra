interface SubMetric {
  label: string;
  value: string;
  color?: string;
}

interface WalletHeroProps {
  walletName: string;
  balance: string;
  description?: string;
  subMetrics?: SubMetric[];
}

export default function WalletHero({
  walletName,
  balance,
  description,
  subMetrics,
}: WalletHeroProps) {
  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden mb-5 lg:mb-6 p-5 lg:p-8"
      style={{
        background: "linear-gradient(135deg, #0A1628 0%, #0E1B37 50%, #0A1628 100%)",
        border: "1px solid rgba(212,175,55,0.22)",
        boxShadow: "0 0 0 1px rgba(212,175,55,0.06), 0 8px 40px rgba(0,0,0,0.5)",
      }}
    >
      {/* Gold glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 10% 50%, rgba(212,175,55,0.07) 0%, transparent 70%)",
        }}
      />
      {/* Grid lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(212,175,55,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="relative">
        <p
          className="text-xs font-semibold uppercase tracking-widest mb-1"
          style={{ color: "rgba(212,175,55,0.65)" }}
        >
          {walletName}
        </p>
        <p
          className="font-heading font-bold text-3xl lg:text-5xl mb-1"
          style={{
            background: "linear-gradient(135deg, #F3D37A 0%, #D4AF37 50%, #B8941F 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            letterSpacing: "-0.02em",
          }}
        >
          {balance}
        </p>
        {description && (
          <p className="text-xs lg:text-sm mt-0.5" style={{ color: "rgba(170,179,197,0.55)" }}>
            {description}
          </p>
        )}

        {subMetrics && subMetrics.length > 0 && (
          <div
            className="grid gap-3 mt-5"
            style={{ gridTemplateColumns: `repeat(${Math.min(subMetrics.length, 3)}, 1fr)` }}
          >
            {subMetrics.map((m) => (
              <div
                key={m.label}
                className="rounded-xl p-3"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p className="text-[10px] font-medium uppercase tracking-wide mb-1" style={{ color: "rgba(170,179,197,0.55)" }}>
                  {m.label}
                </p>
                <p className="text-base lg:text-lg font-bold font-heading" style={{ color: m.color ?? "rgba(255,255,255,0.9)" }}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
