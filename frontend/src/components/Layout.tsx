import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', end: true, label: 'Current', short: 'Live' },
  { to: '/history', end: false, label: 'History', short: 'History' },
  { to: '/analytics', end: false, label: 'Analytics', short: 'Stats' },
  { to: '/settings', end: false, label: 'Settings', short: 'Setup' },
] as const;

export function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">AquaSense</div>
          <div className="brand-sub">Dual-tank water level monitor</div>
        </div>
        <nav className="nav nav-desktop" aria-label="Primary">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="page-content">
        <Outlet />
      </main>

      <nav className="nav-mobile" aria-label="Primary mobile">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className="nav-mobile-link">
            <span className="nav-mobile-label">{link.short}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
