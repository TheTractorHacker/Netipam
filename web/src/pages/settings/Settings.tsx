import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useCan } from '../../auth';
import { ErrorNote, Spinner, Tabs } from '../../components/kit';
import { PageHeader } from '../../components/ui';
import { settingsApi } from './api';
import GeneralTab from './GeneralTab';
import UnifiTab from './UnifiTab';
import ProxmoxTab from './ProxmoxTab';
import { BackupTab, DangerTab } from './DataTabs';
import './settings.css';

type Tab = 'general' | 'unifi' | 'proxmox' | 'backup' | 'danger';

export default function Settings() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['settings', 'bundle'], queryFn: settingsApi.get });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'unifi', label: 'UniFi' },
    { id: 'proxmox', label: 'Proxmox' },
    ...(can.admin ? [{ id: 'backup' as Tab, label: 'Backup & restore' }, { id: 'danger' as Tab, label: 'Danger zone' }] : []),
  ];
  const wanted = params.get('tab') as Tab | null;
  const tab = tabs.some((t) => t.id === wanted) ? (wanted as Tab) : 'general';

  if (!can.edit) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="error" role="alert">Viewer accounts cannot access Settings.</div>
      </>
    );
  }

  return (
    <div className="settings-wrap">
      <PageHeader title="Settings" sub="Connections, updaters, appearance and data management." />
      <Tabs value={tab} onChange={(t) => setParams(t === 'general' ? {} : { tab: t }, { replace: true })} tabs={tabs} />
      {tab === 'proxmox' || tab === 'backup' || tab === 'danger' ? (
        tab === 'proxmox' ? <ProxmoxTab /> : tab === 'backup' ? <BackupTab /> : <DangerTab />
      ) : isLoading ? <Spinner /> : error ? <ErrorNote error={error} /> : data ? (
        tab === 'general' ? <GeneralTab data={data} /> : <UnifiTab data={data} />
      ) : null}
    </div>
  );
}
