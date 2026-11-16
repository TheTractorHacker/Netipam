import type { AppModule } from '../../registry';
import Users from './Users';
import Account from './Account';
import Setup from './Setup';

const mod: AppModule = {
  routes: [
    { path: '/admin/users', element: <Users /> },
    { path: '/account/password', element: <Account /> },
    { path: '/setup', element: <Setup /> },
  ],
  nav: [{ label: 'Users', to: '/admin/users', group: 'System', order: 90, replaces: '/admin/users', roles: ['Admin'] }],
};
export default mod;
