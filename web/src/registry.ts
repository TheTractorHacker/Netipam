import type { ReactNode } from 'react';

/**
 * Every folder in src/pages/<area>/ has a module.tsx whose default export is an AppModule.
 * Routes and sidebar entries are registered automatically — never edit App.tsx or Shell.tsx.
 */
export interface NavEntry {
  label: string;
  /** Route inside /app, e.g. '/subnets'. */
  to: string;
  group: 'Overview' | 'Inventory' | 'Operations' | 'System';
  /** Lower sorts first within the group. */
  order: number;
  /** Classic Blazor path this entry replaces, e.g. '/subnets' — hides the "classic" link for it. */
  replaces?: string;
  /** Visible only to these roles (omit = everyone signed in). */
  roles?: ('Admin' | 'Editor')[];
}

export interface AppModule {
  routes: { path: string; element: ReactNode }[];
  nav?: NavEntry[];
  /** Always-mounted elements (e.g. the Ctrl+K command palette). Rendered once inside the shell. */
  overlays?: ReactNode[];
}

/** Dispatch on window to open the global search palette; the search module listens for it. */
export const OPEN_SEARCH_EVENT = 'netipam:open-search';

const found = import.meta.glob<{ default: AppModule }>('./pages/*/module.tsx', { eager: true });

export const modules: AppModule[] = Object.values(found).map((m) => m.default);
export const allRoutes = modules.flatMap((m) => m.routes);
export const allNav = modules.flatMap((m) => m.nav ?? []);
export const allOverlays = modules.flatMap((m) => m.overlays ?? []);
