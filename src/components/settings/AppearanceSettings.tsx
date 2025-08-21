import React, { useState } from 'react';
import { Sun, Moon, Monitor, Save } from 'lucide-react';
import { Button } from '../shared/Button';

type Theme = 'light' | 'dark' | 'system';

export function AppearanceSettings() {
  const [theme, setTheme] = useState<Theme>('system');
  const [fontSize, setFontSize] = useState('medium');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Implement theme update logic
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Appearance Settings</h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Theme Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-4">
            Theme
          </label>
          <div className="grid grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-4 border rounded-lg flex flex-col items-center gap-2 ${
                theme === 'light'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <Sun className="w-6 h-6 text-amber-500" />
              <span className="text-sm font-medium">Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-4 border rounded-lg flex flex-col items-center gap-2 ${
                theme === 'dark'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <Moon className="w-6 h-6 text-blue-500" />
              <span className="text-sm font-medium">Dark</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              className={`p-4 border rounded-lg flex flex-col items-center gap-2 ${
                theme === 'system'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <Monitor className="w-6 h-6 text-gray-500" />
              <span className="text-sm font-medium">System</span>
            </button>
          </div>
        </div>

        {/* Font Size */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Font Size
          </label>
          <select
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </div>

        {/* Accessibility */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Reduce motion
            </span>
          </label>
          <p className="mt-1 text-sm text-gray-500">
            Minimize animations and transitions
          </p>
        </div>

        {/* Preview */}
        <div className="p-6 border rounded-lg">
          <h4 className="font-medium mb-2">Preview</h4>
          <div className={`p-4 rounded-lg ${
            theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
          }`}>
            <p className={`${
              fontSize === 'small' ? 'text-sm' : 
              fontSize === 'large' ? 'text-lg' : 'text-base'
            }`}>
              This is how your content will look with the selected theme and font size.
            </p>
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
