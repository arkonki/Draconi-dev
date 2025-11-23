import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  User, 
  Settings as SettingsIcon,
  Shield,
  ChevronRight,
  Sword,
  Palette,
  Bell,
  Globe
} from 'lucide-react';
import { ProfileSettings } from '../components/settings/ProfileSettings';
import { AppearanceSettings } from '../components/settings/AppearanceSettings';
import { NotificationSettings } from '../components/settings/NotificationSettings';
import { LocalizationSettings } from '../components/settings/LocalizationSettings';
import { AdminSettings } from '../components/settings/AdminSettings';
import { GameDataManager } from '../components/admin/GameDataManager';

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
  icon: React.FC<{ className?: string; size?: number }>;
  description: string;
  adminOnly?: boolean;
  category: 'account' | 'system' | 'admin';
}

const menuItems: SettingsMenuItem[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: 'Manage your personal information',
    category: 'account'
  },
  // Commented out sections retained for future implementation
  // {
  //   id: 'appearance',
  //   label: 'Appearance',
  //   icon: Palette,
  //   description: 'Customize look and feel',
  //   category: 'system'
  // },
  // {
  //   id: 'notifications',
  //   label: 'Notifications',
  //   icon: Bell,
  //   description: 'Configure alerts',
  //   category: 'system'
  // },
  // {
  //   id: 'localization',
  //   label: 'Language & Region',
  //   icon: Globe,
  //   description: 'Timezone and language',
  //   category: 'system'
  // },
  {
    id: 'game-data',
    label: 'Game Data',
    icon: Sword,
    description: 'Edit spells, items, and monsters',
    adminOnly: true,
    category: 'admin'
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    icon: Shield,
    description: 'User management and system logs',
    adminOnly: true,
    category: 'admin'
  }
];

export function Settings() {
  const { isAdmin } = useAuth();
  
  // Initialize state
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');

  // Security check effect
  useEffect(() => {
    const currentItem = menuItems.find(item => item.id === activeSection);
    if (currentItem?.adminOnly && !isAdmin()) {
      setActiveSection('profile');
    }
  }, [activeSection, isAdmin]);

  // Handler
  const handleSectionChange = (sectionId: SettingsSection) => {
    const selectedItem = menuItems.find(item => item.id === sectionId);
    if (selectedItem && (!selectedItem.adminOnly || isAdmin())) {
      setActiveSection(sectionId);
    }
  };

  // Render Content Switcher
  const renderSettingsContent = () => {
    // Double check permissions at render time for safety
    if (['admin', 'game-data'].includes(activeSection) && !isAdmin()) {
      return <Navigate to="/settings" replace />;
    }

    switch (activeSection) {
      case 'profile': return <ProfileSettings />;
      case 'appearance': return <AppearanceSettings />;
      case 'notifications': return <NotificationSettings />;
      case 'localization': return <LocalizationSettings />;
      case 'game-data': return <GameDataManager />;
      case 'admin': return <AdminSettings />;
      default: return <ProfileSettings />;
    }
  };

  const activeItem = menuItems.find(i => i.id === activeSection);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 min-h-[calc(100vh-4rem)]">
      
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-indigo-600" />
          Settings
        </h1>
        <p className="text-gray-500 mt-2">Manage your account preferences and system configurations.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left Sidebar Navigation */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-8">
          <nav className="space-y-1">
            {menuItems
              .filter(item => !item.adminOnly || isAdmin())
              .map(item => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id)}
                    className={`
                      w-full flex items-center justify-between px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200
                      ${isActive 
                        ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100' 
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon size={20} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
                      <span>{item.label}</span>
                    </div>
                    {isActive && <ChevronRight size={16} className="text-indigo-400" />}
                  </button>
                );
              })}
          </nav>

          {/* Admin Badge (Visual indicator) */}
          {isAdmin() && (
            <div className="px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="flex items-center gap-2 text-indigo-800 font-bold text-xs uppercase tracking-wide mb-1">
                <Shield size={12} /> Admin Access
              </div>
              <p className="text-xs text-indigo-600">You have elevated privileges.</p>
            </div>
          )}
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Mobile/Tablet Header for Content */}
            <div className="border-b border-gray-100 px-6 py-5 bg-gray-50/50">
              <h2 className="text-xl font-bold text-gray-800">{activeItem?.label}</h2>
              <p className="text-sm text-gray-500 mt-1">{activeItem?.description}</p>
            </div>
            
            {/* Actual Content Form */}
            <div className="p-6">
              {renderSettingsContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
