import React, { useState } from 'react';
import { UserPlus, Database, BookOpen } from 'lucide-react';
import { UserManagement } from '../admin/UserManagement';
// Removed SmtpSettings import
// Removed EmailMonitoring import
import { GameDataManager } from '../admin/GameDataManager';
import { CompendiumManager } from '../admin/CompendiumManager';

type AdminSection = 'users' | 'gameData' | 'compendium'; // Removed 'smtp' | 'emailMonitor'

export function AdminSettings() {
  const [activeSection, setActiveSection] = useState<AdminSection>('users');

  const renderSection = () => {
    switch (activeSection) {
      case 'users':
        return <UserManagement />;
      // Removed 'smtp' case
      // Removed 'emailMonitor' case
      case 'gameData':
        return <GameDataManager />;
      case 'compendium':
        return <CompendiumManager />;
      default:
        return null;
    }
  };

  const tabs: { key: AdminSection; label: string; Icon: React.ElementType }[] = [
    { key: 'users',      label: 'Users',         Icon: UserPlus },
    // Removed SMTP tab
    // Removed Email Monitor tab
    // The following tabs were not in the original snippet but are kept based on the remaining AdminSection types
    // If GameDataManager and CompendiumManager were intended to be tabs, they should be added here.
    // For now, I'll assume they are not top-level tabs based on the original structure.
    // If they should be tabs, the UI structure might need further adjustment.
    // For example, if 'gameData' and 'compendium' were meant to be tabs:
    // { key: 'gameData',   label: 'Game Data',     Icon: Database },
    // { key: 'compendium', label: 'Compendium',    Icon: BookOpen },
  ];

  // If 'gameData' and 'compendium' are not meant to be tabs, the `tabs` array might be just for 'users'
  // or the UI needs to be re-thought for how to access GameDataManager and CompendiumManager.
  // Given the original structure had multiple tabs, and now only 'users' remains from the original tabs,
  // I will keep the tab navigation structure but it will only show the 'Users' tab.
  // If GameDataManager and CompendiumManager should also be tabs, they need to be added to the `tabs` array.
  // For now, let's assume they are accessed differently or the UI will be updated later.

  // Updated tabs array to only include 'users' as per the original visible tabs that remain.
  // If 'gameData' and 'compendium' are also meant to be tabs, they should be added here.
  // Based on the provided context, only 'users', 'smtp', and 'emailMonitor' were top-level tabs.
  // Since 'smtp' and 'emailMonitor' are removed, only 'users' remains as a tab.
  // The other sections ('gameData', 'compendium') might be sub-sections or accessed differently.
  // For this update, I will only render the 'Users' tab.

  const remainingTabs: { key: AdminSection; label: string; Icon: React.ElementType }[] = [
    { key: 'users',      label: 'Users',         Icon: UserPlus },
    // Example: If Game Data and Compendium were also tabs:
    // { key: 'gameData', label: 'Game Data', Icon: Database },
    // { key: 'compendium', label: 'Compendium', Icon: BookOpen },
  ];


  return (
    <div className="">
      {/* Top Tab Navigation */}
      {remainingTabs.length > 0 && (
        <nav className="border-b">
          <ul className="flex -mb-px">
            {remainingTabs.map(({ key, label, Icon }) => (
              <li key={key} className="mr-6">
                <button
                  onClick={() => setActiveSection(key)}
                  className={
                    activeSection === key
                      ? 'flex items-center py-2 px-4 text-blue-600 border-b-2 border-blue-600 font-semibold'
                      : 'flex items-center py-2 px-4 text-gray-600 hover:text-gray-800 hover:border-b-2 hover:border-gray-300'
                  }
                >
                  <Icon className="w-5 h-5 mr-2" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Active Section Content */}
      <div className="mt-6 bg-white p-6 rounded-lg shadow">
        {renderSection()}
      </div>
    </div>
  );
}

export default AdminSettings;
