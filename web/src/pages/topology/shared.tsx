import type { ReactNode } from 'react';
import { Badge } from '../../components/kit';

export function statusOf(d: { isStatusTracked: boolean; isOnline: boolean }) {
  return !d.isStatusTracked ? 'Not tracked' : d.isOnline ? 'Online' : 'Offline';
}
export function StatusDot({ d }: { d: { isStatusTracked: boolean; isOnline: boolean } }) {
  const cls = !d.isStatusTracked ? 'off' : d.isOnline ? 'on' : 'down';
  return <span className={'dot ' + cls} role="img" aria-label={statusOf(d)} title={statusOf(d)} />;
}
export function StatusBadge({ d }: { d: { isStatusTracked: boolean; isOnline: boolean } }) {
  return <Badge tone={!d.isStatusTracked ? 'neutral' : d.isOnline ? 'ok' : 'bad'}>{statusOf(d)}</Badge>;
}
export function NameLink({ name, href, className }: { name: string; href: string | null; className?: string }): ReactNode {
  const safe = href && /^https?:\/\//i.test(href) ? href : null;
  return safe
    ? <a className={className} href={safe!} target="_blank" rel="noopener noreferrer">{name}</a>
    : <span className={className}>{name}</span>;
}
