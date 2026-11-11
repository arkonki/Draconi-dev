import { accountRoutes } from './account.js';
import { adminRoutes } from './admin.js';
import { aiRoutes } from './ai.js';
import { authRoutes } from './auth.js';
import { dataRoutes } from './data.js';

export { findRoute, queryOf } from './router.js';

// Every route of the app's own API (the OAuth, MCP and Helper endpoints have their own handlers). One list, so
// what the server answers to is readable in one place; each group lives next to the code it calls.
export const apiRoutes = [
  ...accountRoutes,
  ...aiRoutes,
  ...adminRoutes,
  ...authRoutes,
  ...dataRoutes,
];
