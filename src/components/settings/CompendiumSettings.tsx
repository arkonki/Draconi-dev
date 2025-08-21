import React, { useState } from 'react';
import { FileText, Save, Image, Table, Quote, Code, Plus } from 'lucide-react';
import { Button } from '../shared/Button';
import { TemplateManager } from '../compendium/TemplateManager';
import { CompendiumTemplate } from '../../types/compendium';
import { supabase } from '../../lib/supabase';

export function CompendiumSettings() {
  const [settings, setSettings] = useState({
    editor: {
      defaultView: 'split',
      autoSave: true,
      autoSaveInterval: 30,
      spellCheck: true,
      lineNumbers: true
    },
    formatting: {
      enableTables: true,
      enableImages: true,
      enableCodeBlocks: true,
      enableMathEquations: false,
      enableCustomCSS: false
    },
    display: {
      theme: 'parchment',
      fontSize: 16,
      lineHeight: 1.6,
      maxWidth: 800
    },
    templates: {
      enableTemplates: true,
      defaultTemplate: 'monster'
    }
  });
  const [loading, setLoading] = useState(false);
  const [customCSS, setCustomCSS] = useState('');
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [templates, setTemplates] = useState<CompendiumTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('compendium_templates')
        .select('*')
        .order('category')
        .order('name');

      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    }
  };

  const handleCreateTemplate = async (template: CompendiumTemplate) => {
    try {
      const { error } = await supabase
        .from('compendium_templates')
        .insert([template]);

      if (error) throw error;
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    }
  };

  const handleUpdateTemplate = async (template: CompendiumTemplate) => {
    try {
      const { error } = await supabase
        .from('compendium_templates')
        .update(template)
        .eq('id', template.id);

      if (error) throw error;
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const { error } = await supabase
        .from('compendium_templates')
        .delete()
        .eq('id', templateId);

      if (error) throw error;
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Implement compendium settings update logic
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLoading(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Compendium Settings</h2>
      
      {/* Template Manager Button */}
      <div className="mb-6">
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setShowTemplateManager(true)}
        >
          Manage Templates
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Editor Settings */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Editor Settings</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default View
              </label>
              <select
                value={settings.editor.defaultView}
                onChange={(e) => setSettings({
                  ...settings,
                  editor: { ...settings.editor, defaultView: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="edit">Edit Only</option>
                <option value="preview">Preview Only</option>
                <option value="split">Split View</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.editor.autoSave}
                  onChange={(e) => setSettings({
                    ...settings,
                    editor: { ...settings.editor, autoSave: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enable Auto-Save</span>
              </label>

              {settings.editor.autoSave && (
                <div className="ml-6">
                  <label className="block text-sm text-gray-700 mb-1">
                    Auto-Save Interval (seconds)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={settings.editor.autoSaveInterval}
                    onChange={(e) => setSettings({
                      ...settings,
                      editor: { ...settings.editor, autoSaveInterval: parseInt(e.target.value) }
                    })}
                    className="w-24 px-3 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Formatting Options */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Table className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Formatting Options</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.formatting.enableTables}
                  onChange={(e) => setSettings({
                    ...settings,
                    formatting: { ...settings.formatting, enableTables: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enable Tables</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.formatting.enableImages}
                  onChange={(e) => setSettings({
                    ...settings,
                    formatting: { ...settings.formatting, enableImages: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enable Images</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.formatting.enableCodeBlocks}
                  onChange={(e) => setSettings({
                    ...settings,
                    formatting: { ...settings.formatting, enableCodeBlocks: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enable Code Blocks</span>
              </label>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.formatting.enableMathEquations}
                  onChange={(e) => setSettings({
                    ...settings,
                    formatting: { ...settings.formatting, enableMathEquations: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enable Math Equations</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.formatting.enableCustomCSS}
                  onChange={(e) => setSettings({
                    ...settings,
                    formatting: { ...settings.formatting, enableCustomCSS: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Enable Custom CSS</span>
              </label>
            </div>
          </div>
        </div>

        {/* Display Settings */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Image className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Display Settings</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Theme
              </label>
              <select
                value={settings.display.theme}
                onChange={(e) => setSettings({
                  ...settings,
                  display: { ...settings.display, theme: e.target.value }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="parchment">Parchment</option>
                <option value="modern">Modern</option>
                <option value="dark">Dark</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Font Size (px)
              </label>
              <input
                type="number"
                min="12"
                max="24"
                value={settings.display.fontSize}
                onChange={(e) => setSettings({
                  ...settings,
                  display: { ...settings.display, fontSize: parseInt(e.target.value) }
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Templates */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Quote className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium">Templates</h3>
          </div>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.templates.enableTemplates}
                onChange={(e) => setSettings({
                  ...settings,
                  templates: { ...settings.templates, enableTemplates: e.target.checked }
                })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Enable Templates</span>
            </label>

            {settings.templates.enableTemplates && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Template
                </label>
                <select
                  value={settings.templates.defaultTemplate}
                  onChange={(e) => setSettings({
                    ...settings,
                    templates: { ...settings.templates, defaultTemplate: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="monster">Monster Stat Block</option>
                  <option value="spell">Spell Description</option>
                  <option value="item">Magic Item</option>
                  <option value="location">Location Description</option>
                  <option value="npc">NPC Profile</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Custom CSS */}
        {settings.formatting.enableCustomCSS && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Code className="w-5 h-5 text-gray-500" />
              <h3 className="font-medium">Custom CSS</h3>
            </div>
            <textarea
              value={customCSS}
              onChange={(e) => setCustomCSS(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder="/* Add your custom CSS here */"
            />
          </div>
        )}

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
      
      {/* Template Manager Modal */}
      {showTemplateManager && (
        <TemplateManager
          templates={templates}
          onCreateTemplate={handleCreateTemplate}
          onUpdateTemplate={handleUpdateTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onClose={() => setShowTemplateManager(false)}
        />
      )}
    </div>
  );
}
