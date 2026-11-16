import type { AppModule } from '../../registry';
import AccessPanel from './AccessPanel';

const mod: AppModule = {
  routes: [{ path: '/access-panel', element: <AccessPanel /> }],
  nav: [{ label: 'Access panel', to: '/access-panel', group: 'Overview', order: 20, replaces: '/access-panel' }],
};
export default mod;
