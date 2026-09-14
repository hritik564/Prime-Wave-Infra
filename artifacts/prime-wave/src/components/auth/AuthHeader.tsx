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
    <div className="auth-header">
      {title && (
        <div>
          {showTagline && <p className="auth-eyebrow">PRIMEWAVE / ACCESS</p>}
          <h1 className="auth-title">{title}</h1>
          {subtitle && (
            <p className="auth-subtitle">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
