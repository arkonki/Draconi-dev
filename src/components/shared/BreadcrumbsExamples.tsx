// Example implementations for adding breadcrumbs to your pages

// ============================================
// 1. CHARACTER PAGE (CharacterPage.tsx)
// ============================================
import { Breadcrumbs, useBreadcrumbs } from '../components/shared/Breadcrumbs';

// Inside your CharacterPage component:
export function CharacterPage() {
    const { id } = useParams();
    // ... existing code ...

    const breadcrumbs = useBreadcrumbs(character?.name, 'character');

    return (
        <div>
            <Breadcrumbs items={breadcrumbs} />
            {/* Rest of your character page */}
        </div>
    );
}

// ============================================
// 2. PARTY VIEW (PartyView.tsx)
// ============================================
import { Breadcrumbs } from '../components/shared/Breadcrumbs';
import { Home, Users } from 'lucide-react';

// Inside your PartyView component:
export function PartyView() {
    // ... existing code ...

    const breadcrumbs = [
        { label: 'Home', path: '/', icon: Home },
        { label: 'Adventure Party', path: '/adventure-party', icon: Users },
        { label: party?.name || 'Party' }
    ];

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
            <Breadcrumbs items={breadcrumbs} />
            {/* Rest of your party view */}
        </div>
    );
}

// ============================================
// 3. COMPENDIUM (Compendium.tsx)
// ============================================
import { Breadcrumbs } from '../components/shared/Breadcrumbs';
import { Home, Book } from 'lucide-react';

// Inside your Compendium component:
export function Compendium() {
    const [activeTab, setActiveTab] = useState('items');

    const breadcrumbs = [
        { label: 'Home', path: '/', icon: Home },
        { label: 'Compendium', icon: Book }
    ];

    return (
        <div>
            <Breadcrumbs items={breadcrumbs} />
            {/* Rest of your compendium */}
        </div>
    );
}

// ============================================
// 4. DYNAMIC PARTY TAB BREADCRUMBS
// ============================================
// For PartyView with tab navigation:
const getTabLabel = (tabId: Tab): string => {
    const tabLabels: Record<Tab, string> = {
        members: 'Roster',
        chat: 'Chat',
        notes: 'Journal',
        tasks: 'Quests',
        inventory: 'Stash',
        encounter: 'Combat',
        time: 'Time',
        gmScreen: 'GM Screen',
        storyhelper: 'Story AI'
    };
    return tabLabels[tabId] || tabId;
};

// Enhanced breadcrumbs with active tab:
const breadcrumbs = [
    { label: 'Home', path: '/', icon: Home },
    { label: 'Adventure Party', path: '/adventure-party', icon: Users },
    { label: party?.name || 'Party', path: `/party/${partyId}` },
    activeTab !== 'members' ? { label: getTabLabel(activeTab) } : null
].filter(Boolean) as BreadcrumbItem[];
