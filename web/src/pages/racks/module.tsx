import type { AppModule } from '../../registry';
import Racks from './Racks';
import RackView from './RackView';

const mod: AppModule = {
  routes: [
    { path: '/racks', element: <Racks /> },
    { path: '/racks/view', element: <RackView /> },
    { path: '/racks/view/:id', element: <RackView /> },
  ],
  nav: [
    { label: 'Racks', to: '/racks', group: 'Inventory', order: 40, replaces: '/racks' },
    { label: 'Rack view', to: '/racks/view', group: 'Inventory', order: 41, replaces: '/racks/view' },
  ],
};
export default mod;
