import type { AppModule } from '../../registry';
import Dashboard from './Dashboard';

const mod: AppModule = {
  routes: [{ path: '/', element: <Dashboard /> }],
  nav: [{ label: 'Dashboard', to: '/', group: 'Overview', order: 0, replaces: '/dashboard' }],
};
export default mod;
