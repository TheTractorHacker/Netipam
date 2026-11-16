import type { AppModule } from '../../registry';
import Devices from './Devices';

const mod: AppModule = {
  routes: [
    { path: '/devices', element: <Devices key="device" kind="device" title="Devices" /> },
    { path: '/clients', element: <Devices key="client" kind="client" title="Clients" /> },
  ],
  nav: [
    { label: 'Devices', to: '/devices', group: 'Inventory', order: 10, replaces: '/devices' },
    { label: 'Clients', to: '/clients', group: 'Inventory', order: 20, replaces: '/clients' },
  ],
};
export default mod;
