import React, { useState } from 'react';
import { BookOpen, UserPlus } from 'lucide-react';
import { UserManagement } from '../admin/UserManagement';
import { CompendiumManager } from '../admin/CompendiumManager';

type AdminSection = 'users' | 'compendium';

export function AdminSettings() {
  const [activeSection, setActiveSection] = useState<AdminSection>('users');

  const renderSection = () => {
    switch (activeSection) {
      case 'users':
        return <UserManagement />;
      case 'compendium':
        return <CompendiumManager />;
      default:
        return null;
    }
  };

  const tabs: { key: AdminSection; label: string; Icon: React.ElementType }[] = [
    { key: 'users', label: 'Users', Icon: UserPlus },
    { key: 'compendium', label: 'Compendium', Icon: BookOpen },
  ];

  return (
    <div className="">
      {/* Top Tab Navigation */}
      {tabs.length > 0 && (
        <nav className="border-b">
          <ul className="flex -mb-px">
            {tabs.map(({ key, label, Icon }) => (
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
