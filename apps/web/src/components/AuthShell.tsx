import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">$</span>
          <strong>Finance Auditor</strong>
        </div>
        <div className="auth-header">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
        <div className="auth-footer">{footer}</div>
      </div>
    </div>
  );
}
