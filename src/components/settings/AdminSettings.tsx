import React, { useState } from 'react';
import { Activity, BookOpen, History, LayoutDashboard, Wrench, Users } from 'lucide-react';
import { UserManagement } from '../admin/UserManagement';
import { CompendiumManager } from '../admin/CompendiumManager';
import { AdminActivityLog } from '../admin/AdminActivityLog';
import { AdminOverview } from '../admin/AdminOverview';
import { SystemHealth } from '../admin/SystemHealth';
import { MaintenanceSettings } from './MaintenanceSettings';

type AdminSection = 'overview' | 'users' | 'activity' | 'compendium' | 'maintenance' | 'system';

interface AdminSettingsProps {
  /** Opens the separate Backup & Restore page of Settings. */
  onOpenBackups?: () => void;
}

export function AdminSettings({ onOpenBackups = () => undefined }: AdminSettingsProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview');

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return <AdminOverview onOpenTab={setActiveSection} onOpenBackups={onOpenBackups} />;
      case 'system':
        return <SystemHealth />;
      case 'users':
        return <UserManagement />;
      case 'activity':
        return <AdminActivityLog />;
      case 'compendium':
        return <CompendiumManager />;
      case 'maintenance':
        return <MaintenanceSettings />;
      default:
        return null;
    }
  };

  const tabs: { key: AdminSection; label: string; Icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
    { key: 'users', label: 'Users', Icon: Users },
    { key: 'activity', label: 'Activity', Icon: History },
    { key: 'compendium', label: 'Compendium', Icon: BookOpen },
    { key: 'maintenance', label: 'Maintenance', Icon: Wrench },
    { key: 'system', label: 'System health', Icon: Activity },
  ];

  return (
    <div className="">
      {/* Top Tab Navigation */}
      {tabs.length > 0 && (
        <nav className="overflow-x-auto border-b" aria-label="Administration sections">
          <ul className="flex -mb-px">
            {tabs.map(({ key, label, Icon }) => (
              <li key={key} className="mr-2 flex-none sm:mr-6">
                <button
                  onClick={() => setActiveSection(key)}
                  className={
                    activeSection === key
                      ? 'flex items-center whitespace-nowrap py-2 px-3 text-blue-600 border-b-2 border-blue-600 font-semibold sm:px-4'
                      : 'flex items-center whitespace-nowrap py-2 px-3 text-gray-600 hover:text-gray-800 hover:border-b-2 hover:border-gray-300 sm:px-4'
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
