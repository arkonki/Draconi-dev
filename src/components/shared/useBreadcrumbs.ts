import { useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';
import type { BreadcrumbItem } from './Breadcrumbs';

export const useBreadcrumbs = (
  entityName?: string,
  entityType?: 'character' | 'party' | 'tab',
  parentPath?: string
): BreadcrumbItem[] => {
  const location = useLocation();
  const path = location.pathname;

  const breadcrumbs: BreadcrumbItem[] = [{ label: 'Home', path: '/', icon: Home }];

  if (path.startsWith('/character/')) {
    breadcrumbs.push({
      label: entityName || 'Character',
      path: entityType === 'character' ? undefined : path,
    });
  } else if (path.startsWith('/compendium')) {
    breadcrumbs.push({ label: 'Compendium', path: '/compendium' });
  } else if (path === '/adventure-party') {
    breadcrumbs.push({ label: 'Adventure Party' });
  } else if (path.startsWith('/party/') && !path.includes('/join/')) {
    breadcrumbs.push({ label: 'Adventure Party', path: '/adventure-party' });
    if (entityName) {
      breadcrumbs.push({ label: entityName, path: parentPath });
    }

    if (entityType === 'tab' && parentPath) {
      const tabName = location.hash ? location.hash.substring(1) : '';
      if (tabName) {
        breadcrumbs.push({ label: tabName });
      }
    }
  } else if (path === '/notes') {
    breadcrumbs.push({ label: 'Notes' });
  } else if (path === '/settings') {
    breadcrumbs.push({ label: 'Settings' });
  }

  return breadcrumbs;
};
