interface AuthHeaderProps {
  title?: string;
  subtitle?: string;
  showTagline?: boolean;
}

export function AuthHeader({
  title,
  subtitle,
  showTagline = true,
}: AuthHeaderProps) {
  return (
    <div className="mb-8 text-center">
      <div className="flex justify-center mb-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
          style={{
            background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
            boxShadow: "0 8px 24px rgba(212,175,55,0.3)",
          }}
        >
          <span className="text-xl font-bold" style={{ color: "#050B1A" }}>
            PW
          </span>
        </div>
      </div>

      <h1 className="text-2xl font-bold font-heading text-foreground tracking-tight">
        Prime Wave
      </h1>

      {showTagline && (
        <p
          className="text-[10px] mt-1 tracking-[0.2em] uppercase"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          Beyond Limits. Beyond Growth.
        </p>
      )}

      {title && (
        <div className="mt-6 pt-6" style={{ borderTop: "1px solid hsl(var(--border) / 0.4)" }}>
          <h2 className="text-xl font-semibold font-heading gold-gradient">{title}</h2>
          {subtitle && (
            <p className="mt-1.5 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
