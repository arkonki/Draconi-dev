import React, { useState } from 'react';
import { 
  X, 
  Save, 
  Eye, 
  Code, 
  ArrowLeft,
  Bold,
  Italic,
  Table2,
  Image,
  Link,
  StickyNote
} from 'lucide-react';
import { Button } from '../shared/Button';
import { HomebrewRenderer } from './HomebrewRenderer';
import { CompendiumEntry } from '../../types/compendium';

// New ImagePickerModal component
function ImagePickerModal({ onClose, onSelectImage }) {
  const [activeTab, setActiveTab] = useState<'upload' | 'select'>('upload');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [storedImages, setStoredImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  // Upload file to Supabase storage bucket "images"
  const handleUpload = async () => {
    if (!uploadFile) return;
    setLoading(true);
    // Create a unique filename using timestamp
    const fileName = `${Date.now()}-${uploadFile.name}`;
    const { error } = await supabase.storage.from('images').upload(fileName, uploadFile);
    if (error) {
      alert("Upload error: " + error.message);
      setLoading(false);
      return;
    }
    const { publicURL, error: urlError } = supabase.storage.from('images').getPublicUrl(fileName);
    if (urlError) {
      alert("Error getting public URL: " + urlError.message);
      setLoading(false);
      return;
    }
    onSelectImage(publicURL, width, height);
    setLoading(false);
    onClose();
  };

  // Load stored images from Supabase storage bucket "images"
  const loadStoredImages = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from('images').list('', { limit: 100 });
    if (error) {
      alert("Error listing images: " + error.message);
      setLoading(false);
      return;
    }
    // Map each item to its public URL
    const urls = data.map(item => {
      const { publicURL } = supabase.storage.from('images').getPublicUrl(item.name);
      return publicURL;
    });
    setStoredImages(urls);
    setLoading(false);
  };

  // When switching to "select" tab, load stored images
  React.useEffect(() => {
    if (activeTab === 'select') {
      loadStoredImages();
    }
  }, [activeTab]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Select an Image</h3>
          <button onClick={onClose}>
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex gap-4 mb-4">
          <Button variant="secondary" size="sm" onClick={() => setActiveTab('upload')}>
            Upload
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setActiveTab('select')}>
            Select
          </Button>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium">Width (e.g., 300px or 100%)</label>
          <input 
            type="text" 
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium">Height (e.g., 200px)</label>
          <input 
            type="text" 
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
        </div>
        {activeTab === 'upload' ? (
          <div>
            <input 
              type="file" 
              accept="image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  setUploadFile(e.target.files[0]);
                }
              }}
            />
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={handleUpload} loading={loading}>
                Upload Image
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {loading ? (
              <p>Loading images...</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {storedImages.map((url, index) => (
                  <img 
                    key={index} 
                    src={url} 
                    alt="Stored" 
                    className={`cursor-pointer border ${selectedImage === url ? 'border-blue-500' : 'border-gray-200'}`}
                    onClick={() => setSelectedImage(url)}
                  />
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setActiveTab('upload')}>
                Back to Upload
              </Button>
              <Button 
                variant="primary" 
                onClick={() => {
                  if (selectedImage) {
                    onSelectImage(selectedImage, width, height);
                    onClose();
                  }
                }}
                disabled={!selectedImage}
              >
                Select Image
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Import supabase instance (if not imported elsewhere)
import { supabase } from '../../lib/supabase';

interface CompendiumFullPageProps {
  entry: CompendiumEntry;
  onClose: () => void;
  onSave: (entry: CompendiumEntry) => Promise<void>;
  onSaveAsTemplate?: (entry: CompendiumEntry) => Promise<void>;
}

export function CompendiumFullPage({ entry, onClose, onSave, onSaveAsTemplate }: CompendiumFullPageProps) {
  const [editedEntry, setEditedEntry] = useState(entry);
  const [previewMode, setPreviewMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await onSave(editedEntry);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (onSaveAsTemplate) {
      setLoading(true);
      try {
        await onSaveAsTemplate(editedEntry);
      } finally {
        setLoading(false);
      }
    }
  };

  // Function to insert image markdown with optional width/height attributes.
  const insertImageMarkdown = (url: string, width?: string, height?: string) => {
    let markdown = `![Image description](${url})`;
    if (width || height) {
      // Custom attributes appended in a curly-brace block.
      const attrs = [];
      if (width) attrs.push(`width="${width}"`);
      if (height) attrs.push(`height="${height}"`);
      markdown += `{${attrs.join(' ')}}`;
    }
    // Append with a newline.
    setEditedEntry({
      ...editedEntry,
      content: editedEntry.content + "\n" + markdown + "\n"
    });
  };

  return (
    <div className="fixed inset-0 bg-white z-50 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between bg-white">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            icon={ArrowLeft}
            onClick={onClose}
          >
            Back
          </Button>
          <h2 className="text-xl font-bold">{editedEntry.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={previewMode ? Code : Eye}
            onClick={() => setPreviewMode(!previewMode)}
          >
            {previewMode ? 'Edit' : 'Preview'}
          </Button>
          {onSaveAsTemplate && (
            <Button
              variant="secondary"
              onClick={handleSaveAsTemplate}
              loading={loading}
            >
              Save as Template
            </Button>
          )}
          <Button
            variant="primary"
            icon={Save}
            onClick={handleSave}
            loading={loading}
          >
            Save
          </Button>
        </div>
      </div>
      
      {/* Toolbar */}
      {!previewMode && (
        <div className="border-b p-2 flex items-center gap-2 bg-white">
          <Button
            variant="secondary"
            size="sm"
            icon={Bold}
            onClick={() => {
              const textarea = document.querySelector('textarea');
              if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const text = textarea.value;
                const before = text.substring(0, start);
                const selection = text.substring(start, end);
                const after = text.substring(end);
                setEditedEntry({
                  ...editedEntry,
                  content: `${before}**${selection}**${after}`
                });
              }
            }}
          >
            Bold
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Italic}
            onClick={() => {
              const textarea = document.querySelector('textarea');
              if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const text = textarea.value;
                const before = text.substring(0, start);
                const selection = text.substring(start, end);
                const after = text.substring(end);
                setEditedEntry({
                  ...editedEntry,
                  content: `${before}_${selection}_${after}`
                });
              }
            }}
          >
            Italic
          </Button>
          <div className="w-px h-6 bg-gray-300" />
          <Button
            variant="secondary"
            size="sm"
            icon={Table2}
            onClick={() => {
              const tableTemplate = `
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`;
              setEditedEntry({
                ...editedEntry,
                content: editedEntry.content + tableTemplate
              });
            }}
          >
            Table
          </Button>
          {/* Updated Image button */}
          <Button
            variant="secondary"
            size="sm"
            icon={Image}
            onClick={() => setShowImagePicker(true)}
          >
            Image
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Link}
            onClick={() => {
              const linkTemplate = `[Link text](https://example.com)`;
              setEditedEntry({
                ...editedEntry,
                content: editedEntry.content + linkTemplate
              });
            }}
          >
            Link
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={StickyNote}
            onClick={() => {
              const noteTemplate = `
> ### Note
> This is a note block for important information.
`;
              setEditedEntry({
                ...editedEntry,
                content: editedEntry.content + noteTemplate
              });
            }}
          >
            Note
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex">
          {/* Editor */}
          {!previewMode && (
            <div className="flex-1 p-6 overflow-auto bg-gray-50">
              <div className="max-w-4xl mx-auto space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={editedEntry.title}
                    onChange={(e) => setEditedEntry({
                      ...editedEntry,
                      title: e.target.value
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
                    value={editedEntry.category}
                    onChange={(e) => setEditedEntry({
                      ...editedEntry,
                      category: e.target.value
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Content
                  </label>
                  <textarea
                    value={editedEntry.content}
                    onChange={(e) => setEditedEntry({
                      ...editedEntry,
                      content: e.target.value
                    })}
                    rows={20}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {previewMode && (
            <div className="flex-1 p-6 overflow-auto bg-gray-50 homebrew">
              <div className="max-w-4xl mx-auto prose">
                <h1>{editedEntry.title}</h1>
                <div className="mb-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {editedEntry.category}
                  </span>
                </div>
                <HomebrewRenderer content={editedEntry.content} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Picker Modal */}
      {showImagePicker && (
        <ImagePickerModal
          onClose={() => setShowImagePicker(false)}
          onSelectImage={(url, widthValue, heightValue) => {
            insertImageMarkdown(url, widthValue, heightValue);
          }}
        />
      )}
    </div>
  );
}
