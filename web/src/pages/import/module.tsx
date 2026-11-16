import type { AppModule } from '../../registry';
import UnifiImport from './UnifiImport';

const mod: AppModule = {
  routes: [{ path: '/unifi-import', element: <UnifiImport /> }],
  nav: [{ label: 'UniFi import', to: '/unifi-import', group: 'Operations', order: 20, replaces: '/unifi-import', roles: ['Admin', 'Editor'] }],
};
export default mod;
