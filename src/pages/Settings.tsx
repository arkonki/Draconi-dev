import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  User, 
  Settings as SettingsIcon,
  Bell,
  Palette,
  Globe,
  Shield,
  ChevronRight,
  Sword
} from 'lucide-react';
import { ProfileSettings } from '../components/settings/ProfileSettings';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { NotificationSettings } from '../components/settings/NotificationSettings';
import { LocalizationSettings } from '../components/settings/LocalizationSettings';
import { AdminSettings } from '../components/settings/AdminSettings';
import { Card } from '../components/shared/Card';
import { GameDataManager } from '../components/admin/GameDataManager';
import { Navigate } from 'react-router-dom'; // Import Navigate

type SettingsSection = 
  | 'profile'
  | 'appearance'
  | 'notifications'
  | 'localization'
  | 'admin'
  | 'game-data';

interface SettingsMenuItem {
  id: SettingsSection;
  label: string;
  icon: React.FC<{ className?: string }>;
  description: string;
  adminOnly?: boolean;
}

const menuItems: SettingsMenuItem[] = [
  {
    id: 'profile',
    label: 'Profile Settings',
    icon: User,
    description: 'Manage your personal information and account settings'
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    description: 'Customize the look and feel of the application'
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    description: 'Configure your notification preferences'
  },
  {
    id: 'localization',
    label: 'Localization',
    icon: Globe,
    description: 'Set your language, timezone and regional preferences'
  },
  {
    id: 'game-data',
    label: 'Game Data Editor',
    icon: Sword,
    description: 'Edit game data such as spells and items',
    adminOnly: true
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    icon: Shield,
    description: 'System administration and user management',
    adminOnly: true
  }
];

export function Settings() {
  const { isAdmin } = useAuth();
  // Default to 'profile' if the current selection is admin-only and user is not admin
  const [activeSection, setActiveSection] = useState<SettingsSection>(() => {
    const initialSection: SettingsSection = 'profile'; // Default
    // Potentially load from state/URL later, but for now, default safely
    return initialSection;
  });

  const handleSectionChange = (sectionId: SettingsSection) => {
    const selectedItem = menuItems.find(item => item.id === sectionId);
    // Allow changing only if the item exists and (it's not admin-only OR the user is admin)
    if (selectedItem && (!selectedItem.adminOnly || isAdmin())) {
      setActiveSection(sectionId);
    } else if (selectedItem?.adminOnly && !isAdmin()) {
      // If trying to access admin section without rights, redirect or default
      console.warn("Attempted to access admin settings without privileges.");
      setActiveSection('profile'); // Reset to a safe default
    }
  };

  // Ensure the active section is valid upon initial render or role change
  React.useEffect(() => {
    const currentItem = menuItems.find(item => item.id === activeSection);
    if (currentItem?.adminOnly && !isAdmin()) {
      setActiveSection('profile');
    }
  }, [activeSection, isAdmin]);


  const renderSettingsContent = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSettings />;
      case 'appearance':
        return <AppearanceSettings />;
      case 'notifications':
        return <NotificationSettings />;
      case 'localization':
        return <LocalizationSettings />;
      case 'game-data':
        // Double-check admin rights before rendering admin components
        return isAdmin() ? <GameDataManager /> : <Navigate to="/settings" replace />;
      case 'admin':
        // Double-check admin rights before rendering admin components
        return isAdmin() ? <AdminSettings /> : <Navigate to="/settings" replace />;
      default:
        // Fallback to profile or a dedicated "access denied" component
        return <Navigate to="/settings" replace />; 
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <SettingsIcon className="w-8 h-8 text-gray-700" />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Settings Navigation */}
        <div className="col-span-12 md:col-span-4 space-y-4">
          {menuItems
            // Filter menu items based on admin role
            .filter(item => !item.adminOnly || isAdmin()) 
            .map(item => (
              <Card
                key={item.id}
                onClick={() => handleSectionChange(item.id)} // Use handler
                className={`cursor-pointer transition-all ${
                  activeSection === item.id
                    ? 'ring-2 ring-blue-500 bg-blue-50'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${
                    activeSection === item.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{item.label}</h3>
                    <p className="text-sm text-gray-600">{item.description}</p>
                  </div>
                  <ChevronRight className={`w-5 h-5 ${
                    activeSection === item.id
                      ? 'text-blue-500'
                      : 'text-gray-400'
                  }`} />
                </div>
              </Card>
            ))}
        </div>

        {/* Settings Content */}
        <div className="col-span-12 md:col-span-8">
          <Card>
            {renderSettingsContent()}
          </Card>
        </div>
      </div>
    </div>
  );
}
