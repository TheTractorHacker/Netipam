import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCan } from '../../auth';
import { ErrorNote, Spinner } from '../../components/kit';
import { Empty, PageHeader } from '../../components/ui';
import { accessApi, type PanelDevice } from './api';
import CategoriesDialog from './CategoriesDialog';
import OrderDialog from './OrderDialog';
import './access.css';

/** Classic icons are MudBlazor SVG fragments; render only <path d> data (ignoring the empty bounding path). */
function iconPaths(icon: string | null): string[] {
  if (!icon) return [];
  const out: string[] = [];
  for (const m of icon.matchAll(/<path\b([^>]*)>/gi)) {
    if (/fill\s*=\s*["']none["']/i.test(m[1])) continue;
    const d = /\bd\s*=\s*"([^"]*)"/i.exec(m[1]);
    if (d && /^[0-9a-zA-Z\s.,\-+]*$/.test(d[1])) out.push(d[1]);
  }
  return out;
}

function Tile({ d }: { d: PanelDevice }) {
  const paths = iconPaths(d.icon);
  const status = d.tracked ? (d.online ? 'Online' : 'Offline') : 'Not tracked';
  const body = (
    <>
      <div className="access-tile-top">
        <span className="access-ico" aria-hidden>
          {paths.length ? <svg viewBox="0 0 24 24">{paths.map((p, i) => <path key={i} d={p} />)}</svg> : (d.clientType || d.name).charAt(0).toUpperCase()}
        </span>
        <span className="access-name" title={d.name}>{d.name}</span>
      </div>
      <div className="access-meta"><span className={'access-dot ' + (d.tracked ? (d.online ? 'ok' : 'bad') : '')} aria-hidden />{status}</div>
      <div className="access-meta" title={`${d.clientType ?? '-'} | ${d.ipPort}`}>{d.clientType ?? '-'} | {d.ipPort}</div>
    </>
  );
  return d.href
    ? <a className="access-tile" href={d.href} target="_blank" rel="noopener noreferrer">{body}</a>
    : <div className="access-tile nolink" title={`Link is not valid: ${d.rawLink ?? ''}`}>{body}</div>;
}

export default function AccessPanel() {
  const { edit } = useCan();
  const q = useQuery({ queryKey: ['access', 'panel'], queryFn: accessApi.panel });
  const [dlg, setDlg] = useState<'order' | 'cats' | null>(null);

  return (
    <>
      <PageHeader
        title="Access panel"
        sub={q.data ? `${q.data.total} device${q.data.total === 1 ? '' : 's'} with an access link` : undefined}
        actions={
          <>
            <button className="btn" onClick={() => setDlg('order')}>Arrange</button>
            <button className="btn" onClick={() => setDlg('cats')}>{edit ? 'Manage categories' : 'Categories'}</button>
          </>
        }
      />
      {q.isLoading ? <Spinner /> : q.error ? <ErrorNote error={q.error} /> : !q.data || q.data.groups.length === 0 ? (
        <Empty>No devices with access links found. Add an access link to a device to see it here.</Empty>
      ) : q.data.groups.map((g) => (
        <section className="access-group" key={g.categoryId ?? 'none'} aria-label={g.name}>
          <div className="access-group-head">
            <h2>{g.name}</h2>
            <span className="muted">{g.description || `${g.devices.length} item${g.devices.length === 1 ? '' : 's'}`}</span>
          </div>
          <div className="access-grid">{g.devices.map((d) => <Tile key={d.id} d={d} />)}</div>
        </section>
      ))}
      {dlg === 'order' && <OrderDialog onClose={() => setDlg(null)} />}
      {dlg === 'cats' && <CategoriesDialog onClose={() => setDlg(null)} />}
    </>
  );
}
