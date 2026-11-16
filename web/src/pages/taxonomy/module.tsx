import type { AppModule } from '../../registry';
import Locations from './Locations';
import LocationDevicesPage from './LocationDevices';
import ClientTypes from './ClientTypes';

const mod: AppModule = {
  routes: [
    { path: '/locations', element: <Locations /> },
    { path: '/locations/:id/devices', element: <LocationDevicesPage /> },
    { path: '/client-types', element: <ClientTypes /> },
  ],
  nav: [
    { label: 'Locations', to: '/locations', group: 'Inventory', order: 50, replaces: '/locations' },
    { label: 'Client types', to: '/client-types', group: 'Inventory', order: 51, replaces: '/client-types' },
  ],
};
export default mod;
