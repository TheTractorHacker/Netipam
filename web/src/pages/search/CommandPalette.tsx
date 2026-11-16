import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from './api';
import { OPEN_SEARCH_EVENT } from '../../registry';
import { useDebounced } from '../../components/kit';
import { useGo } from './nav';

interface Item { key: string; title: string; subtitle?: string | null; kind: string; to: string }

const PAGES: Item[] = [
  ['Dashboard', '/'], ['Access Panel', '/access-panel'], ['Devices', '/devices'], ['Clients', '/clients'],
  ['Rack View', '/racks/view'], ['Subnets', '/subnets'], ['Hosts & Guests', '/hosts'], ['Network Topology', '/topology'],
  ['Import', '/unifi-import'], ['Updater Logs', '/logs'], ['IP History', '/ip-history'], ['Settings', '/settings'],
  ['Locations', '/locations'], ['Racks', '/racks'], ['Client Types', '/client-types'],
].map(([title, to]) => ({ key: 'p:' + to, title, kind: 'Page', to }));

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  const go = useGo();
  const uid = useId();
  const listId = `${uid}-list`;

  const close = useCallback(() => {
    setOpen(false);
    prevFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    const show = () => {
      setOpen((o) => {
        if (!o) prevFocus.current = document.activeElement as HTMLElement | null;
        return true;
      });
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
      }
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  const trimmed = query.trim();
  const dq = useDebounced(trimmed, 120);
  const { data, isFetching, error } = useQuery({
    queryKey: ['search', 'palette', dq],
    queryFn: () => searchApi.search(dq, true),
    enabled: open && dq.length > 0,
    staleTime: 15_000,
  });

  const items = useMemo<Item[]>(() => {
    if (!trimmed) return PAGES.slice(0, 8);
    const q = trimmed.toLowerCase();
    const out = PAGES.filter((p) => p.title.toLowerCase().includes(q));
    if (data && dq === trimmed) {
      for (const d of data.devices)
        out.push({ key: 'd:' + d.id, title: d.name, subtitle: d.ip, kind: d.isDevice ? 'Device' : 'Client', to: `/search?q=${encodeURIComponent(d.name)}` });
      for (const s of data.subnets)
        out.push({ key: 's:' + s.id, title: s.name, subtitle: s.cidr, kind: 'Subnet', to: `/subnets/${s.id}/ips` });
    }
    out.push({ key: 'all', title: `Search everything for “${trimmed}”`, kind: 'Search', to: `/search?q=${encodeURIComponent(trimmed)}` });
    return out;
  }, [trimmed, dq, data]);

  useEffect(() => { setSelected((s) => Math.min(s, Math.max(items.length - 1, 0))); }, [items.length]);
  useEffect(() => { setSelected(0); }, [trimmed]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, items]);

  const choose = (it: Item) => {
    setOpen(false);
    go(it.to);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => (s + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => (s - 1 + items.length) % items.length); }
    else if (e.key === 'Home') { e.preventDefault(); setSelected(0); }
    else if (e.key === 'End') { e.preventDefault(); setSelected(items.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[Math.min(selected, items.length - 1)]); }
  };

  if (!open) return null;

  const status = error ? 'Search failed.' : isFetching ? 'Searching…' : `${items.length} result${items.length === 1 ? '' : 's'}`;

  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input">
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={items.length ? `${uid}-opt-${selected}` : undefined}
            aria-label="Jump to a page, device, subnet or IP"
            placeholder="Jump to a page, device, subnet or IP…"
            autoComplete="off" spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <kbd>Esc</kbd>
        </div>
        {error && <div className="cmdk-note bad-text">{(error as Error).message}</div>}
        <ul id={listId} ref={listRef} role="listbox" className="cmdk-list">
          {items.map((it, i) => (
            <li
              key={it.key} id={`${uid}-opt-${i}`} role="option" aria-selected={i === selected}
              className={'cmdk-item' + (i === selected ? ' on' : '')}
              onMouseMove={() => i !== selected && setSelected(i)}
              onClick={() => choose(it)}
            >
              <span className="cmdk-title">{it.title}</span>
              {it.subtitle && <span className="cmdk-sub mono">{it.subtitle}</span>}
              <span className="cmdk-kind">{it.kind}</span>
            </li>
          ))}
          {items.length === 0 && <li className="cmdk-note muted" role="presentation">No matches.</li>}
        </ul>
        <div className="cmdk-foot muted small" aria-live="polite">
          <span>{status}</span>
          <span className="cmdk-keys"><kbd>↑↓</kbd> navigate <kbd>↵</kbd> open</span>
        </div>
      </div>
    </div>
  );
}
