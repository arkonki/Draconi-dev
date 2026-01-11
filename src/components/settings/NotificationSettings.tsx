import React, { useState, useEffect } from 'react';
import { Bell, LampDesk as Desktop, Save, Volume2, Check, X, FlaskConical } from 'lucide-react';
import { Button } from '../shared/Button';
import { useNotifications } from '../../contexts/NotificationContext'; 

const formatLabel = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

// Touch-Friendly Toggle Row
const ToggleRow = ({ 
  label, 
  checked, 
  onChange, 
  description,
  disabled = false
}: { 
  label: string; 
  checked: boolean; 
  onChange: () => void;
  description?: string;
  disabled?: boolean;
}) => (
  <label className={`
    flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer select-none
    ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-indigo-200 active:bg-gray-50'}
  `}>
    <div className="flex-1">
      <div className={`font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</div>
      {description && <div className="text-xs text-gray-500 mt-0.5">{description}</div>}
    </div>
    
    <div className="relative inline-flex items-center cursor-pointer">
      <input 
        type="checkbox" 
        className="sr-only peer" 
        checked={checked} 
        onChange={onChange} 
        disabled={disabled}
      />
      <div className="
        w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer 
        peer-checked:after:translate-x-full peer-checked:after:border-white 
        after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
        after:bg-white after:border-gray-300 after:border after:rounded-full 
        after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600
      "></div>
    </div>
  </label>
);

export function NotificationSettings() {
  const { settings, isLoading, updateSettings, playSound, sendDesktopNotification } = useNotifications();
  
  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [permissionStatus, setPermissionStatus] = useState(Notification.permission);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  const toggleSetting = (category: 'email' | 'desktop', key: string) => {
    if (!localSettings) return;
    setLocalSettings(prev => prev ? ({
      ...prev,
      [category]: { 
        ...prev[category], 
        [key]: !prev[category][key as keyof typeof prev[typeof category]] 
      }
    }) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localSettings) return;

    setIsSaving(true);
    setMessage(null);

    try {
      await updateSettings(localSettings);
      setMessage({ type: 'success', text: 'Settings saved' });
      // Play a sound to confirm volume settings
      if (localSettings.sounds.enabled) playSound('notification');
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save changes.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestPermission = async () => {
    const result = await Notification.requestPermission();
    setPermissionStatus(result);
    if (result === 'granted') {
      sendDesktopNotification('Success', 'Notifications are now enabled!', 'message');
    }
  };

  const handleTestNotification = () => {
    sendDesktopNotification('Test Notification', 'If you see this, it works!', 'message');
    playSound('notification');
  };

  if (isLoading || !localSettings) {
    return <div className="p-8 text-center text-gray-500">Loading settings...</div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-gray-900">Notification Preferences</h2>
        {message && (
          <div className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message.type === 'success' ? <Check size={14} /> : <X size={14} />} {message.text}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* --- DESKTOP SECTION --- */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Desktop className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-gray-900">Push Notifications</h3>
            </div>
            {/* Permission Request Button */}
            {permissionStatus === 'default' && (
              <Button type="button" size="xs" onClick={handleRequestPermission} variant="outline">
                Enable Browser Permissions
              </Button>
            )}
            {permissionStatus === 'granted' && (
               <Button type="button" size="xs" onClick={handleTestNotification} variant="ghost" icon={FlaskConical}>
                 Test
               </Button>
            )}
          </div>

          {permissionStatus === 'denied' && (
            <div className="bg-red-50 text-red-800 text-sm p-3 rounded-lg border border-red-100">
              ⚠️ Notifications are blocked by your browser. Please enable them in your browser settings (usually the lock icon in the URL bar).
            </div>
          )}
          
          <div className="grid gap-3">
            {Object.entries(localSettings.desktop).map(([key, value]) => (
              <ToggleRow
                key={key}
                label={formatLabel(key)}
                checked={value}
                onChange={() => toggleSetting('desktop', key)}
                disabled={permissionStatus === 'denied'}
              />
            ))}
          </div>
        </div>

        {/* --- SOUND SECTION --- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Bell className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Sound Effects</h3>
          </div>
          
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-6">
            
            {/* FIX: Changed div to label for Master Switch */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="font-medium text-gray-900">Enable Audio</span>
              <div className="relative inline-flex items-center">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={localSettings.sounds.enabled}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    sounds: { ...localSettings.sounds, enabled: e.target.checked }
                  })}
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </div>
            </label>

            {/* Volume Slider */}
            <div className={`transition-all duration-300 ${!localSettings.sounds.enabled ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span className="flex items-center gap-2"><Volume2 size={16}/> Master Volume</span>
                  <span className="font-mono">{localSettings.sounds.volume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={localSettings.sounds.volume}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    sounds: { ...localSettings.sounds, volume: parseInt(e.target.value) }
                  })}
                  onMouseUp={() => playSound('dice')} // Play sound when releasing slider
                  onTouchEnd={() => playSound('dice')}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="grid gap-3 pt-2">
                <ToggleRow
                  label="Dice Rolls"
                  description="Sound when 3D dice are rolling"
                  checked={localSettings.sounds.diceRolls}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    sounds: { ...localSettings.sounds, diceRolls: !localSettings.sounds.diceRolls }
                  })}
                  disabled={!localSettings.sounds.enabled}
                />
                <ToggleRow
                  label="System Alerts"
                  description="Sound for chat messages and invites"
                  checked={localSettings.sounds.notifications}
                  onChange={(e) => setLocalSettings({
                    ...localSettings,
                    sounds: { ...localSettings.sounds, notifications: !localSettings.sounds.notifications }
                  })}
                  disabled={!localSettings.sounds.enabled}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-4 pt-4">
          <Button type="submit" variant="primary" icon={Save} loading={isSaving} className="w-full md:w-auto shadow-lg" size="lg">
            Save Preferences
          </Button>
        </div>
      </form>
    </div>
  );
}