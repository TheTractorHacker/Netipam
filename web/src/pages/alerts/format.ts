import { timeAgo } from '../../components/kit';

/** "MM-dd-yyyy HH:mm" in local time, matching the classic pages. */
export function absTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const relTime = timeAgo;

export function ipSortKey(ip: string | null): number {
  if (!ip) return Number.MAX_SAFE_INTEGER;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip.trim());
  if (!m) return Number.MAX_SAFE_INTEGER;
  return ((+m[1] * 256 + +m[2]) * 256 + +m[3]) * 256 + +m[4];
}
