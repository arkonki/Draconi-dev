import React, { useState, useEffect } from 'react';
import { Bell, LampDesk as Desktop, Save, Volume2, Music, Check, X } from 'lucide-react';
import { Button } from '../shared/Button';
import { useNotifications } from '../../contexts/NotificationContext'; 

const formatLabel = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

// --- Helper Component: Touch-Friendly Toggle Row ---
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
    flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer
    ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-100' : 'bg-white border-gray-200 hover:border-indigo-200 active:bg-gray-50'}
  `}>
    <div className="flex-1">
      <div className={`font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</div>
      {description && <div className="text-xs text-gray-500 mt-0.5">{description}</div>}
    </div>
    
    {/* iOS Style Switch */}
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
  const { settings, isLoading, updateSettings } = useNotifications();
  
  const [localSettings, setLocalSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (settings) setLocalSettings(settings);
  }, [settings]);

  // Generic Toggle Handler
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
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save changes.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !localSettings) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl font-bold text-gray-900">Notification Preferences</h2>
        
        {/* Floating Feedback Message */}
        {message && (
          <div className={`
            px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2
            ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
          `}>
            {message.type === 'success' ? <Check size={14} /> : <X size={14} />}
            {message.text}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        {/* --- DESKTOP SECTION --- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Desktop className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Push Notifications</h3>
          </div>
          
          <div className="grid gap-3">
            {Object.entries(localSettings.desktop).map(([key, value]) => (
              <ToggleRow
                key={key}
                label={formatLabel(key)}
                checked={value}
                onChange={() => toggleSetting('desktop', key)}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 px-1">
            * Notifications will appear as system popups on your device.
          </p>
        </div>

        {/* --- SOUND SECTION --- */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <Bell className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-gray-900">Sound Effects</h3>
          </div>
          
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-6">
            
            {/* Master Switch */}
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Enable Audio</span>
              <div className="relative inline-flex items-center cursor-pointer">
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
            </div>

            {/* Volume Slider - Only show if enabled */}
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
                  // Custom styling for a larger touch target on the slider thumb
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              <div className="grid gap-3 pt-2">
                <ToggleRow
                  label="Dice Rolls"
                  description="Sound when dice are rolling"
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

        {/* --- HIDDEN EMAIL SECTION --- */}
        {/* We keep the data in state for DB compatibility, but do not render the UI */}

        {/* Save Bar (Sticky on Mobile if needed, or just at bottom) */}
        <div className="sticky bottom-4 pt-4">
          <Button
            type="submit"
            variant="primary"
            icon={Save}
            loading={isSaving}
            className="w-full md:w-auto shadow-lg"
            size="lg"
          >
            Save Preferences
          </Button>
        </div>
      </form>
    </div>
  );
}
