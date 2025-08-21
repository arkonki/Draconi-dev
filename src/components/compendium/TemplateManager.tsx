import React, { useState } from 'react';
import { Plus, Save, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { Button } from '../shared/Button';
import { CompendiumTemplate } from '../../types/compendium';
import { HomebrewRenderer } from './HomebrewRenderer';

interface TemplateManagerProps {
  templates: CompendiumTemplate[];
  onCreateTemplate: (template: CompendiumTemplate) => Promise<void>;
  onUpdateTemplate: (template: CompendiumTemplate) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  onClose: () => void;
}

export function TemplateManager({
  templates,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onClose
}: TemplateManagerProps) {
  const [editingTemplate, setEditingTemplate] = useState<CompendiumTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!editingTemplate) return;

    try {
      setLoading(true);
      if (editingTemplate.id) {
        await onUpdateTemplate(editingTemplate);
      } else {
        await onCreateTemplate(editingTemplate);
      }
      setEditingTemplate(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Template Manager</h2>
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Close
            </Button>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-800">Error</h4>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {editingTemplate ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={editingTemplate.name}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    name: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={editingTemplate.category}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    category: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={editingTemplate.description}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    description: e.target.value
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content
                </label>
                <textarea
                  value={editingTemplate.content}
                  onChange={(e) => setEditingTemplate({
                    ...editingTemplate,
                    content: e.target.value
                  })}
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button
                  variant="secondary"
                  onClick={() => setEditingTemplate(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={Save}
                  onClick={handleSave}
                  loading={loading}
                >
                  {editingTemplate.id ? 'Update Template' : 'Create Template'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => setEditingTemplate({
                    name: '',
                    category: '',
                    description: '',
                    content: ''
                  })}
                >
                  Create Template
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="p-4 border rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium">{template.name}</h3>
                        <p className="text-sm text-gray-600">{template.description}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingTemplate(template)}
                          className="p-1 text-gray-500 hover:text-blue-600"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteTemplate(template.id!)}
                          className="p-1 text-gray-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">
                      Category: {template.category}
                    </div>
                    <div className="mt-2 p-2 bg-gray-50 rounded-md text-sm">
                      <HomebrewRenderer 
                        content={template.content.length > 100
                          ? template.content.slice(0, 100) + '...' 
                          : template.content} 
                        preview={true}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
