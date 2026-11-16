import type { AppModule } from '../../registry';
import Scan from './Scan';
import './scan.css';

const mod: AppModule = {
  routes: [{ path: '/scan', element: <Scan /> }],
  nav: [{ label: 'Network scan', to: '/scan', group: 'Operations', order: 60, roles: ['Admin', 'Editor'] }],
};
export default mod;
