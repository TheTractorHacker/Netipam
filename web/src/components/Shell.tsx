import { NavLink } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Me } from '../api';

// `to` = page already ported to React. `href` = still served by the legacy Blazor UI.
const NAV: { label: string; to?: string; href?: string; group: string }[] = [
  { group: 'Overview', label: 'Dashboard', to: '/' },
  { group: 'Inventory', label: 'Devices', to: '/devices' },
  { group: 'Inventory', label: 'Clients', to: '/clients' },
  { group: 'Inventory', label: 'Subnets', href: '/subnets' },
  { group: 'Inventory', label: 'Hosts & Guests', href: '/hosts' },
  { group: 'Inventory', label: 'Racks', href: '/racks/view' },
  { group: 'Inventory', label: 'Topology', href: '/topology' },
  { group: 'Inventory', label: 'Access Panel', href: '/access-panel' },
  { group: 'Operations', label: 'Import', href: '/unifi-import' },
  { group: 'Operations', label: 'Updater Logs', href: '/logs' },
  { group: 'Operations', label: 'IP History', href: '/ip-history' },
  { group: 'System', label: 'Settings', href: '/settings' },
  { group: 'System', label: 'About', href: '/about' },
];

export default function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const qc = useQueryClient();
  const groups = [...new Set(NAV.map((n) => n.group))];

  const logout = async () => {
    await api.logout();
    qc.clear();
    window.location.assign('/app/');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>N</span>
          <span>Netipam</span>
        </div>
        <nav>
          {groups.map((g) => (
            <div key={g} className="nav-group">
              <div className="nav-heading">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) =>
                n.to ? (
                  <NavLink key={n.label} to={n.to} end={n.to === '/'} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                    {n.label}
                  </NavLink>
                ) : (
                  <a key={n.label} href={n.href} className="nav-item legacy" title="Opens the classic page">
                    {n.label}
                    <span className="legacy-tag">classic</span>
                  </a>
                ),
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <strong>{me.name}</strong>
            <span>{me.roles.join(', ') || 'User'}</span>
          </div>
          <button className="btn ghost sm" onClick={logout}>Log out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
