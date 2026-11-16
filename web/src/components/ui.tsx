import type { ReactNode } from 'react';

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
      </div>
      <div className="row">{actions}</div>
    </header>
  );
}

export function Stat({ label, value, tone, href }: { label: string; value: number; tone?: 'bad' | 'warn' | 'info'; href?: string }) {
  const inner = (
    <>
      <div className="stat-label">{label}</div>
      <div className={'stat-value num' + (tone ? ` ${tone}-text` : '')}>{value.toLocaleString()}</div>
    </>
  );
  return href ? <a className="card stat link" href={href}>{inner}</a> : <div className="card stat">{inner}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
