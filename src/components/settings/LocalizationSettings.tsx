import React, { useState } from 'react';
import { Globe, Clock, Calendar, Save } from 'lucide-react';
import { Button } from '../shared/Button';

interface LocalizationOption {
  value: string;
  label: string;
}

const languages: LocalizationOption[] = [
  { value: 'en', label: 'English' },
  { value: 'et', label: 'Estonian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'sv', label: 'Swedish' }
];

const timeZones: LocalizationOption[] = [
  { value: 'Europe/Tallinn', label: 'Europe/Tallinn (UTC+2)' },
  { value: 'Europe/Helsinki', label: 'Europe/Helsinki (UTC+2)' },
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm (UTC+1)' },
  { value: 'UTC', label: 'UTC' }
];

const dateFormats: LocalizationOption[] = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
];

const timeFormats: LocalizationOption[] = [
  { value: '24h', label: '24-hour (14:30)' },
  { value: '12h', label: '12-hour (2:30 PM)' }
];

export function LocalizationSettings() {
  const [settings, setSettings] = useState({
    language: 'en',
    timeZone: 'Europe/Tallinn',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    firstDayOfWeek: 1, // Monday
    useMetricSystem: true
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Implement localization settings update logic
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  };

  const now = new Date();
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: settings.timeZone
  }).format(now);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Localization Settings</h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Language */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Language & Region</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interface Language
              </label>
              <select
                value={settings.language}
                onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {languages.map(lang => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Zone
              </label>
              <select
                value={settings.timeZone}
                onChange={(e) => setSettings({ ...settings, timeZone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {timeZones.map(tz => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Date & Time */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Date & Time Format</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date Format
              </label>
              <select
                value={settings.dateFormat}
                onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {dateFormats.map(format => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Format
              </label>
              <select
                value={settings.timeFormat}
                onChange={(e) => setSettings({ ...settings, timeFormat: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {timeFormats.map(format => (
                  <option key={format.value} value={format.value}>
                    {format.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Day of Week
              </label>
              <select
                value={settings.firstDayOfWeek}
                onChange={(e) => setSettings({ ...settings, firstDayOfWeek: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={1}>Monday</option>
                <option value={0}>Sunday</option>
              </select>
            </div>
          </div>
        </div>

        {/* Units */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Measurement System</h3>
          </div>
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.useMetricSystem}
                onChange={(e) => setSettings({ ...settings, useMetricSystem: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Use Metric System</span>
            </label>
          </div>
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Preview</h4>
          <p className="text-sm text-gray-600">
            Current date and time: {formattedDate}
          </p>
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
