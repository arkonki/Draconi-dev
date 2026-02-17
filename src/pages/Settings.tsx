import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { 
  User, 
  Settings as SettingsIcon,
  Shield,
  ChevronRight,
  Sword,
  Bell, // Ensure Bell is imported
  ArrowLeft
} from 'lucide-react';

// Import your sub-components
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
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    description: 'Configure email, desktop and sound alerts',
    category: 'account'
  },
  // Future implementations...
  // { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Customize look and feel', category: 'system' },
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
  
  // State
  const [activeSection, setActiveSection] = useState<SettingsSection>('profile');
  
  // Mobile Navigation State
  const [showMobileMenu, setShowMobileMenu] = useState(true);

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
      setShowMobileMenu(false); // Hide menu on mobile after selection
    }
  };

  const handleBackToMenu = () => {
    setShowMobileMenu(true);
  };

  // Render Content Switcher
  const renderSettingsContent = () => {
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
    <div className="max-w-7xl mx-auto px-4 py-4 md:py-8 min-h-[calc(100vh-4rem)]">
      
      {/* Header - Hidden on mobile if viewing content to save space */}
      <div className={`mb-6 md:mb-8 ${!showMobileMenu ? 'hidden lg:block' : 'block'}`}>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <SettingsIcon className="w-6 h-6 md:w-8 md:h-8 text-indigo-600" />
          Settings
        </h1>
        <p className="text-sm md:text-base text-gray-500 mt-2">Manage your account preferences and system configurations.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        
        {/* --- LEFT SIDEBAR NAVIGATION --- */}
        <div className={`
          w-full lg:w-72 flex-shrink-0 space-y-6 md:space-y-8
          ${!showMobileMenu ? 'hidden lg:block' : 'block'}
        `}>
          <nav className="space-y-2">
            {menuItems
              .filter(item => !item.adminOnly || isAdmin())
              .map(item => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id)}
                    className={`
                      w-full flex items-center justify-between px-4 py-4 md:py-3 text-sm font-medium rounded-xl transition-all duration-200 border md:border-transparent
                      ${isActive 
                        ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-100 border-indigo-100' 
                        : 'text-gray-600 bg-white md:bg-transparent border-gray-100 hover:bg-gray-50 hover:text-gray-900'
                      }
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isActive ? 'bg-indigo-50' : 'bg-gray-50 md:bg-transparent'}`}>
                        <item.icon size={20} className={isActive ? 'text-indigo-600' : 'text-gray-400'} />
                      </div>
                      <div className="text-left">
                        <span className="block font-semibold md:font-medium">{item.label}</span>
                        <span className="block lg:hidden text-xs text-gray-400 font-normal mt-0.5">{item.description}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} className={`text-gray-300 ${isActive ? 'text-indigo-400' : ''}`} />
                  </button>
                );
              })}
          </nav>

          {/* Admin Badge */}
          {isAdmin() && (
            <div className="px-4 py-3 bg-indigo-50 rounded-xl border border-indigo-100 mx-1 md:mx-0">
              <div className="flex items-center gap-2 text-indigo-800 font-bold text-xs uppercase tracking-wide mb-1">
                <Shield size={12} /> Admin Access
              </div>
              <p className="text-xs text-indigo-600">You have elevated privileges.</p>
            </div>
          )}
        </div>

        {/* --- RIGHT CONTENT PANEL --- */}
        <div className={`
          flex-1 min-w-0
          ${showMobileMenu ? 'hidden lg:block' : 'block'}
        `}>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px]">
            
            {/* Content Header with Mobile Back Button */}
            <div className="border-b border-gray-100 px-4 md:px-6 py-4 md:py-5 bg-gray-50/50 flex items-center gap-3">
              <button 
                onClick={handleBackToMenu}
                className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-full transition-colors"
              >
                <ArrowLeft size={20} />
              </button>

              <div>
                <h2 className="text-lg md:text-xl font-bold text-gray-800 flex items-center gap-2">
                  <span className="lg:hidden">
                    {activeItem && <activeItem.icon size={18} className="text-indigo-600"/>}
                  </span>
                  {activeItem?.label}
                </h2>
                <p className="text-xs md:text-sm text-gray-500 mt-0.5">{activeItem?.description}</p>
              </div>
            </div>
            
            {/* Actual Content Form */}
            <div className="p-4 md:p-6">
              {renderSettingsContent()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
