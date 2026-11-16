import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type Me } from '../auth';
import { allNav, allOverlays, OPEN_SEARCH_EVENT, type NavEntry } from '../registry';
import { inApp } from '../pages/search/nav';

const GROUPS: NavEntry['group'][] = ['Overview', 'Inventory', 'Operations', 'System'];

// Classic Blazor pages. A link is hidden as soon as a React module declares `replaces` for it.
const CLASSIC: { label: string; href: string; group: NavEntry['group'] }[] = [
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

const norm = (p: string) => p.replace(/\/+$/, '').toLowerCase();

export default function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const qc = useQueryClient();
  const [navOpen, setNavOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  // Keep every plain <a href="/page"> inside the SPA when a React route serves it, so no link in the
  // whole UI (present or future) drops back to the classic pages. Exports, downloads, new-tab
  // clicks and external links are left alone.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download') || a.origin !== window.location.origin) return;
      const path = a.pathname;
      if (path.startsWith('/app/') || path === '/app' || path.startsWith('/api/') || !inApp(path)) return;
      e.preventDefault();
      navigate(path + a.search + a.hash);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);
  useEffect(() => setNavOpen(false), [loc.pathname]); // close the mobile menu after navigating
  const replaced = new Set(allNav.map((n) => n.replaces).filter(Boolean).map((p) => norm(p!)));
  const isAdmin = me.roles.includes('Admin');
  const canEdit = isAdmin || me.roles.includes('Editor');
  const visible = (n: NavEntry) => !n.roles || (n.roles.includes('Admin') && isAdmin) || (n.roles.includes('Editor') && canEdit);

  const logout = async () => {
    await authApi.logout();
    qc.clear();
    window.location.assign('/app/');
  };

  return (
    <div className="shell">
      <aside className={'sidebar' + (navOpen ? ' open' : '')}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>N</span>
          <span>Netipam</span>
          <button className="menu-btn btn ghost sm" aria-expanded={navOpen} aria-controls="main-nav" onClick={() => setNavOpen((o) => !o)}>
            {navOpen ? 'Close' : 'Menu'}
          </button>
        </div>
        <nav id="main-nav">
          {GROUPS.map((g) => {
            const react = allNav.filter((n) => n.group === g && visible(n)).sort((a, b) => a.order - b.order);
            const classic = CLASSIC.filter((c) => c.group === g && !replaced.has(norm(c.href)));
            if (!react.length && !classic.length) return null;
            return (
              <div key={g} className="nav-group">
                <div className="nav-heading">{g}</div>
                {react.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.to === '/' || allNav.some((o) => o !== n && o.to.startsWith(n.to + '/'))} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
                    {n.label}
                  </NavLink>
                ))}
                {classic.map((c) => (
                  <a key={c.href} href={c.href} className="nav-item legacy" title="Opens the classic page">
                    {c.label}<span className="legacy-tag">classic</span>
                  </a>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <strong>{me.name}</strong>
            <span>{me.roles.join(', ') || 'User'}</span>
          </div>
          <div className="foot-actions">
            <Link className="btn ghost sm" to="/account/password">Change password</Link>
            <button className="btn ghost sm" onClick={logout}>Log out</button>
          </div>
        </div>
      </aside>
      <div className="content">
        <div className="topbar">
          <button className="searchbtn" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}>
            <span>Search devices, IPs, subnets…</span><kbd>Ctrl K</kbd>
          </button>
        </div>
        <main className="main">{children}</main>
      </div>
      {allOverlays.map((o, i) => <div key={i} className="overlay-slot">{o}</div>)}
    </div>
  );
}
