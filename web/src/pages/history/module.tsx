import type { AppModule } from '../../registry';
import DeviceHistoryPage from './DeviceHistory';
import Logs from './Logs';
import IpHistory from './IpHistory';
import About from './About';

const mod: AppModule = {
  routes: [
    { path: '/devices/:id/history', element: <DeviceHistoryPage /> },
    { path: '/logs', element: <Logs /> },
    { path: '/ip-history', element: <IpHistory /> },
    { path: '/about', element: <About /> },
  ],
  nav: [
    { label: 'Updater Logs', to: '/logs', group: 'Operations', order: 50, replaces: '/logs' },
    { label: 'IP History', to: '/ip-history', group: 'Operations', order: 60, replaces: '/ip-history' },
    { label: 'About', to: '/about', group: 'System', order: 90, replaces: '/about' },
  ],
};
export default mod;
