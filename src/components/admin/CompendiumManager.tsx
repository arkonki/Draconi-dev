import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Save, X, Edit2, Trash2, AlertCircle, Eye, Code } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

interface CompendiumEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  created_by: string;
}

export function CompendiumManager() {
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!title.trim() || !content.trim() || !category.trim()) {
        setError('All fields are required');
        return;
      }

      if (!user) {
        setError('You must be logged in to create or edit entries');
        return;
      }

      if (isEditing) {
        const { error: updateError } = await supabase
          .from('compendium')
          .update({ title, content, category })
          .eq('id', isEditing);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('compendium')
          .insert([{ 
            title, 
            content, 
            category,
            created_by: user.id 
          }]);

        if (insertError) throw insertError;
      }

      setTitle('');
      setContent('');
      setCategory('');
      setIsCreating(false);
      setIsEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save entry');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-gray-700">
              Content
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode(false)}
                className={`p-2 rounded-lg ${!previewMode ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Code className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode(true)}
                className={`p-2 rounded-lg ${previewMode ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Eye className="w-5 h-5" />
              </button>
            </div>
          </div>

          {previewMode ? (
            <div className="min-h-[300px] p-4 border border-gray-300 rounded-md bg-white overflow-auto">
              <MarkdownRenderer content={content} />
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
              placeholder="# Heading 1&#10;## Heading 2&#10;&#10;Regular text with **bold** and *italic* formatting.&#10;&#10;> Blockquote for important notes&#10;&#10;| Table | Header |&#10;|--------|---------|&#10;| Cell 1 | Cell 2 |"
            />
          )}
        </div>

        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => {
              setIsCreating(false);
              setIsEditing(null);
              setTitle('');
              setContent('');
              setCategory('');
              setPreviewMode(false);
            }}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Save className="w-5 h-5" />
            {isEditing ? 'Update Entry' : 'Save Entry'}
          </button>
        </div>
      </form>
    </div>
  );
}
