import type { AppModule } from '../../registry';
import Subnets from './Subnets';
import SubnetIpsPage from './SubnetIps';
import './subnets.css';

const mod: AppModule = {
  routes: [
    { path: '/subnets', element: <Subnets /> },
    { path: '/subnets/:id/ips', element: <SubnetIpsPage /> },
  ],
  nav: [{ label: 'Subnets', to: '/subnets', group: 'Inventory', order: 30, replaces: '/subnets' }],
};
export default mod;
