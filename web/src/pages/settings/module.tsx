import type { AppModule } from '../../registry';
import Settings from './Settings';
import { ThemeApplier } from './theme';

const mod: AppModule = {
  routes: [{ path: '/settings', element: <Settings /> }],
  nav: [{ label: 'Settings', to: '/settings', group: 'System', order: 90, replaces: '/settings', roles: ['Admin', 'Editor'] }],
  overlays: [<ThemeApplier key="settings-theme" />],
};
export default mod;
