import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
    label: string;
    path?: string;
    icon?: React.ElementType;
}

interface BreadcrumbsProps {
    items: BreadcrumbItem[];
    maxItems?: number;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ items, maxItems = 4 }) => {
    const location = useLocation();

    // Don't show breadcrumbs on home page or if there's only one item
    if (items.length <= 1 && location.pathname === '/') {
        return null;
    }

    // Truncate if too many items (keep first, last, and ellipsis in middle)
    let displayItems = items;
    if (items.length > maxItems) {
        displayItems = [
            items[0],
            { label: '...', path: undefined },
            ...items.slice(-(maxItems - 2))
        ];
    }

    return (
        <nav aria-label="Breadcrumb" className="mb-4 overflow-hidden">
            <ol className="flex items-center space-x-1 text-sm overflow-x-auto no-scrollbar whitespace-nowrap pb-1">
                {displayItems.map((item, index) => {
                    const isLast = index === displayItems.length - 1;
                    const Icon = item.icon;

                    return (
                        <li key={index} className="flex items-center flex-shrink-0">
                            {index > 0 && (
                                <ChevronRight className="w-3.5 h-3.5 text-gray-400 mx-1 flex-shrink-0" />
                            )}

                            {item.path && !isLast ? (
                                <Link
                                    to={item.path}
                                    className="flex items-center gap-1.5 text-gray-600 hover:text-indigo-600 transition-colors font-medium hover:underline px-1 py-0.5 rounded hover:bg-gray-100"
                                >
                                    {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                                    <span className="truncate max-w-[100px] sm:max-w-[200px]">{item.label}</span>
                                </Link>
                            ) : (
                                <span
                                    className={`flex items-center gap-1.5 px-1 py-0.5 ${isLast
                                        ? 'text-gray-900 font-semibold'
                                        : 'text-gray-500'
                                        }`}
                                >
                                    {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                                    <span className="truncate max-w-[120px] sm:max-w-[200px]">{item.label}</span>
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

/**
 * Hook to generate breadcrumbs based on current route and context
 */
export const useBreadcrumbs = (
    entityName?: string,
    entityType?: 'character' | 'party' | 'tab',
    parentPath?: string
): BreadcrumbItem[] => {
    const location = useLocation();
    const path = location.pathname;

    const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', path: '/', icon: Home }
    ];

    // Character pages
    if (path.startsWith('/character/')) {
        breadcrumbs.push({
            label: entityName || 'Character',
            path: entityType === 'character' ? undefined : path
        });
    }

    // Compendium
    else if (path.startsWith('/compendium')) {
        breadcrumbs.push({ label: 'Compendium', path: '/compendium' });
    }

    // Party list
    else if (path === '/adventure-party') {
        breadcrumbs.push({ label: 'Adventure Party' });
    }

    // Party detail
    else if (path.startsWith('/party/') && !path.includes('/join/')) {
        breadcrumbs.push({ label: 'Adventure Party', path: '/adventure-party' });
        if (entityName) {
            breadcrumbs.push({ label: entityName, path: parentPath });
        }

        // Add tab if specified
        if (entityType === 'tab' && parentPath) {
            const tabName = location.hash ? location.hash.substring(1) : '';
            if (tabName) {
                breadcrumbs.push({ label: tabName });
            }
        }
    }

    // Notes
    else if (path === '/notes') {
        breadcrumbs.push({ label: 'Notes' });
    }

    // Settings
    else if (path === '/settings') {
        breadcrumbs.push({ label: 'Settings' });
    }

    return breadcrumbs;
};
