import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">AquaSense</div>
          <div className="brand-sub">Dual-tank water level monitor</div>
        </div>
        <nav className="nav" aria-label="Primary">
          <NavLink to="/" end>
            Current
          </NavLink>
          <NavLink to="/history">History</NavLink>
          <NavLink to="/analytics">Analytics</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
