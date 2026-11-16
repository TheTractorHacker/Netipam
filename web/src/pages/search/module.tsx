import type { AppModule } from '../../registry';
import SearchPage from './SearchPage';
import CommandPalette from './CommandPalette';
import './search.css';

const mod: AppModule = {
  routes: [{ path: '/search', element: <SearchPage /> }],
  overlays: [<CommandPalette key="cmdk" />],
};
export default mod;
