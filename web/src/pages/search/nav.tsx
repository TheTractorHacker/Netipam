import type { MouseEvent, ReactNode } from 'react';
import { Link, matchPath, useNavigate } from 'react-router-dom';
import { allRoutes } from '../../registry';

/** True when a React route already serves this path (otherwise the classic Blazor page does). */
export function inApp(path: string): boolean {
  const p = path.split('?')[0];
  return allRoutes.some((r) => !!matchPath({ path: r.path, end: true }, p));
}

/** Returns a function that navigates in-app when a React route exists, else to the classic page. */
export function useGo() {
  const navigate = useNavigate();
  return (path: string) => (inApp(path) ? navigate(path) : window.location.assign(path));
}

/** Link that stays in the SPA when the target is ported, and falls back to the classic page otherwise. */
export function SmartLink({ to, children, className, onClick }: { to: string; children: ReactNode; className?: string; onClick?: (e: MouseEvent) => void }) {
  return inApp(to)
    ? <Link to={to} className={className} onClick={onClick}>{children}</Link>
    : <a href={to} className={className} onClick={onClick}>{children}</a>;
}
