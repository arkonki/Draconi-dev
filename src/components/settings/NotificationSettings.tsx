import React, { useState } from 'react';
import { Bell, Mail, LampDesk as Desktop, Save } from 'lucide-react';
import { Button } from '../shared/Button';

export function NotificationSettings() {
  const [settings, setSettings] = useState({
    email: {
      newMessage: true,
      partyInvite: true,
      sessionScheduled: true,
      systemUpdates: false
    },
    desktop: {
      newMessage: true,
      partyInvite: true,
      sessionScheduled: true,
      diceRolls: true
    },
    sounds: {
      enabled: true,
      volume: 80,
      diceRolls: true,
      notifications: true
    }
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Implement notification settings update logic
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Notification Settings</h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Email Notifications */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Email Notifications</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(settings.email).map(([key, value]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setSettings({
                    ...settings,
                    email: { ...settings.email, [key]: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Desktop Notifications */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Desktop className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Desktop Notifications</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(settings.desktop).map(([key, value]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => setSettings({
                    ...settings,
                    desktop: { ...settings.desktop, [key]: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Sound Settings */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Sound Settings</h3>
          </div>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.sounds.enabled}
                onChange={(e) => setSettings({
                  ...settings,
                  sounds: { ...settings.sounds, enabled: e.target.checked }
                })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Enable Sounds</span>
            </label>

            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Volume ({settings.sounds.volume}%)
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={settings.sounds.volume}
                onChange={(e) => setSettings({
                  ...settings,
                  sounds: { ...settings.sounds, volume: parseInt(e.target.value) }
                })}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.sounds.diceRolls}
                  onChange={(e) => setSettings({
                    ...settings,
                    sounds: { ...settings.sounds, diceRolls: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Dice Roll Sounds</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.sounds.notifications}
                  onChange={(e) => setSettings({
                    ...settings,
                    sounds: { ...settings.sounds, notifications: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Notification Sounds</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            icon={Save}
            loading={loading}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
