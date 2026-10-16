import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useCurrentUser, useLogout } from "../lib/auth";

const NAV_ITEMS = [
  { to: "/", label: "Documents" },
  { to: "/transactions", label: "Transactions" },
  { to: "/insights", label: "Insights" },
];

export function ProtectedLayout() {
  const { data, isPending, isError } = useCurrentUser();
  const logout = useLogout();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="auth-shell">
        <p className="hint">Loading…</p>
      </div>
    );
  }
  if (isError || !data?.user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <Link to="/" className="brand">
              <span className="brand-mark">$</span>
              Finance Auditor
            </Link>
            <nav className="nav-links">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`nav-link${location.pathname === item.to ? " active" : ""}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="topbar-user">
            <span>{data.user.email}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
