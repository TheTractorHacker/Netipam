import type { AppModule } from '../../registry';
import OfflineAlerts from './OfflineAlerts';
import OfflineClients from './OfflineClients';
import DiscoveryAlerts from './DiscoveryAlerts';
import FirmwareAlerts from './FirmwareAlerts';

const mod: AppModule = {
  routes: [
    { path: '/alerts/offline', element: <OfflineAlerts /> },
    { path: '/clients/offline', element: <OfflineClients /> },
    { path: '/subnets/:id/clients/offline', element: <OfflineClients /> },
    { path: '/alerts/discovery', element: <DiscoveryAlerts /> },
    { path: '/alerts/firmware', element: <FirmwareAlerts /> },
  ],
  nav: [
    { label: 'Offline alerts', to: '/alerts/offline', group: 'Operations', order: 10, replaces: '/alerts/offline' },
    { label: 'New devices', to: '/alerts/discovery', group: 'Operations', order: 11, replaces: '/alerts/discovery' },
    { label: 'Offline clients', to: '/clients/offline', group: 'Operations', order: 12, replaces: '/clients/offline' },
  ],
};
export default mod;
