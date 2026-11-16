import type { AppModule } from '../../registry';
import Topology from './Topology';
import Hosts from './Hosts';

const mod: AppModule = {
  routes: [
    { path: '/topology', element: <Topology /> },
    { path: '/hosts', element: <Hosts /> },
  ],
  nav: [
    { label: 'Topology', to: '/topology', group: 'Inventory', order: 40, replaces: '/topology' },
    { label: 'Hosts & guests', to: '/hosts', group: 'Inventory', order: 41, replaces: '/hosts' },
  ],
};
export default mod;
