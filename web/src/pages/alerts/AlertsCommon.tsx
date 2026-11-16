import { useNavigate } from 'react-router-dom';
import { ErrorNote, Spinner, Tabs } from '../../components/kit';
import { Empty } from '../../components/ui';
import './alerts.css';

type Kind = 'offline' | 'discovery' | 'firmware';
const PATHS: Record<Kind, string> = { offline: '/alerts/offline', discovery: '/alerts/discovery', firmware: '/alerts/firmware' };

export function AlertTabs({ active }: { active: Kind }) {
  const nav = useNavigate();
  return (
    <Tabs<Kind>
      value={active}
      onChange={(k) => nav(PATHS[k])}
      tabs={[{ id: 'offline', label: 'Offline' }, { id: 'discovery', label: 'New devices' }, { id: 'firmware', label: 'Firmware' }]}
    />
  );
}

export function ViewToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="seg" role="group" aria-label="Alert state">
      <button className={!value ? 'on' : ''} aria-pressed={!value} onClick={() => onChange(false)}>open</button>
      <button className={value ? 'on' : ''} aria-pressed={value} onClick={() => onChange(true)}>acknowledged</button>
    </div>
  );
}

export function QueryState({ isLoading, error, empty, emptyText, children }: {
  isLoading: boolean; error: unknown; empty: boolean; emptyText: string; children: React.ReactNode;
}) {
  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote error={error} />;
  if (empty) return <Empty>{emptyText}</Empty>;
  return <>{children}</>;
}
