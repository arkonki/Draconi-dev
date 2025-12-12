import React, { useState, useEffect } from 'react';
import { 
  X, Upload, Image as ImageIcon, Loader, Check, 
  Folder, FolderPlus, ChevronRight, Home, ArrowUp 
} from 'lucide-react';
import { Button } from '../shared/Button';
import { supabase } from '../../lib/supabase';

interface ImagePickerModalProps {
  onClose: () => void;
  onSelectImage: (url: string, width?: string, height?: string) => void;
}

interface StorageItem {
  name: string;
  id: string | null;
  isFolder: boolean;
  url?: string;
}

export function ImagePickerModal({ onClose, onSelectImage }: ImagePickerModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'select'>('upload');
  
  // State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [items, setItems] = useState<StorageItem[]>([]); // Combined list
  const [loading, setLoading] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string[]>([]); // Folder navigation stack
  
  // Dimensions for insertion
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');

  // --- Helpers ---

  const getPathString = (pathArray: string[] = currentPath) => {
    return pathArray.length > 0 ? pathArray.join('/') : '';
  };

  // --- Actions ---

  const handleCreateFolder = async () => {
    const folderName = prompt("Enter folder name:");
    if (!folderName) return;

    // Sanitize folder name
    const sanitizedName = folderName.replace(/[^a-zA-Z0-9-_]/g, '-');
    
    setLoading(true);
    try {
      // Supabase storage folders are virtual. To "create" one, we usually upload a placeholder.
      const path = [...currentPath, sanitizedName, '.emptyFolderPlaceholder'].join('/');
      
      const { error } = await supabase.storage
        .from('images')
        .upload(path, new Blob([''], { type: 'text/plain' }));

      if (error) throw error;
      
      // Refresh
      loadStoredItems();
    } catch (err: any) {
      console.error("Error creating folder:", err);
      alert("Failed to create folder: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in to upload.");

      const fileExt = uploadFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      
      // Construct full path including current folder
      const pathString = getPathString();
      const filePath = pathString ? `${pathString}/${fileName}` : fileName;

      // 1. Upload
      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, uploadFile);

      if (uploadError) throw uploadError;

      // 2. Get URL
      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      // Success - Insert immediately or switch to select tab
      onSelectImage(urlData.publicUrl, width, height);
      onClose();

    } catch (error: any) {
      console.error("Upload failed:", error);
      alert(error.message || "Failed to upload image.");
    } finally {
      setLoading(false);
    }
  };

  const loadStoredItems = async () => {
    setLoading(true);
    try {
      const pathString = getPathString();

      // List files in the current directory
      const { data, error } = await supabase.storage
        .from('images')
        .list(pathString, { 
          limit: 100, 
          sortBy: { column: 'name', order: 'asc' } 
        });

      if (error) throw error;

      if (!data) {
        setItems([]);
        return;
      }

      // Process items to distinguish folders vs files
      // Supabase returns folders with id: null (usually) or simply structure implied
      const processedItems: StorageItem[] = data
        .filter(item => item.name !== '.emptyFolderPlaceholder') // Hide placeholder files
        .map(item => {
          // Check if it's a folder (no ID usually implies folder in .list() response, 
          // or strictly based on metadata absence)
          const isFolder = !item.metadata; 
          
          let url = undefined;
          if (!isFolder) {
             const fullPath = pathString ? `${pathString}/${item.name}` : item.name;
             const { data: urlData } = supabase.storage.from('images').getPublicUrl(fullPath);
             url = urlData.publicUrl;
          }

          return {
            name: item.name,
            id: item.id,
            isFolder,
            url
          };
        });

      // Sort: Folders first, then files
      processedItems.sort((a, b) => {
        if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
        return a.isFolder ? -1 : 1;
      });

      setItems(processedItems);

    } catch (error: any) {
      console.error("Error loading images:", error);
      alert("Could not load images.");
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folderName: string) => {
    setCurrentPath(prev => [...prev, folderName]);
    setSelectedUrl(null);
  };

  const navigateUp = () => {
    setCurrentPath(prev => prev.slice(0, -1));
    setSelectedUrl(null);
  };

  const navigateToBreadcrumb = (index: number) => {
     setCurrentPath(prev => prev.slice(0, index + 1));
     setSelectedUrl(null);
  };

  // --- Effects ---

  useEffect(() => {
    if (activeTab === 'select') {
      loadStoredItems();
    }
  }, [activeTab, currentPath]);

  // --- Render ---

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden font-sans">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-white z-10">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <ImageIcon size={20} className="text-indigo-600"/>
            Image Manager
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'upload' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Upload New
          </button>
          <button
            onClick={() => setActiveTab('select')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'select' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Browse Library
          </button>
        </div>

        {/* Content Container */}
        <div className="flex-1 overflow-hidden relative flex flex-col bg-gray-50">
          
          {loading && (
            <div className="absolute inset-0 bg-white/60 z-20 flex flex-col items-center justify-center text-indigo-600 backdrop-blur-[1px]">
              <Loader className="w-8 h-8 animate-spin mb-2" />
              <span className="text-sm font-medium">Processing...</span>
            </div>
          )}

          {activeTab === 'upload' ? (
            <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
              <div className="w-full max-w-sm">
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-white hover:bg-gray-50 hover:border-indigo-400 transition-all group shadow-sm">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-3 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-gray-400">into: /{getPathString() || 'root'}</p>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => e.target.files && setUploadFile(e.target.files[0])}
                  />
                </label>
                {uploadFile && (
                  <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-md text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                    <Check size={16} />
                    Selected: <span className="font-semibold truncate">{uploadFile.name}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Breadcrumbs Toolbar */}
              <div className="bg-white border-b border-gray-200 p-2 px-4 flex items-center justify-between gap-2 shadow-sm shrink-0">
                <div className="flex items-center flex-wrap gap-1 text-sm text-gray-600 overflow-hidden">
                  <button 
                    onClick={() => { setCurrentPath([]); setSelectedUrl(null); }}
                    className="p-1 hover:bg-gray-100 rounded-md text-gray-500 hover:text-indigo-600 transition-colors"
                  >
                    <Home size={16} />
                  </button>
                  
                  {currentPath.map((folder, index) => (
                    <div key={folder + index} className="flex items-center gap-1">
                      <ChevronRight size={14} className="text-gray-300" />
                      <button 
                        onClick={() => navigateToBreadcrumb(index)}
                        className="hover:text-indigo-600 hover:underline px-1 rounded font-medium truncate max-w-[100px]"
                      >
                        {folder}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {currentPath.length > 0 && (
                    <Button variant="ghost" size="icon_sm" onClick={navigateUp} title="Up one level">
                       <ArrowUp size={16} />
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={handleCreateFolder} className="text-xs h-8">
                    <FolderPlus size={14} className="mr-1.5"/> New Folder
                  </Button>
                </div>
              </div>

              {/* Grid Area */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                    <Folder className="w-12 h-12 mb-2 opacity-20" />
                    <p className="text-sm">Empty folder</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {/* Render Folders */}
                    {items.filter(i => i.isFolder).map(folder => (
                      <div 
                        key={folder.name}
                        onClick={() => navigateToFolder(folder.name)}
                        className="group flex flex-col items-center justify-center p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all aspect-square"
                      >
                        <Folder className="w-10 h-10 text-indigo-200 fill-indigo-50 group-hover:text-indigo-500 group-hover:fill-indigo-100 transition-colors mb-2" />
                        <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 truncate w-full text-center px-2">
                          {folder.name}
                        </span>
                      </div>
                    ))}

                    {/* Render Files */}
                    {items.filter(i => !i.isFolder).map(file => (
                      <div 
                        key={file.name}
                        onClick={() => setSelectedUrl(file.url || null)}
                        className={`
                          relative group cursor-pointer rounded-lg overflow-hidden border bg-white aspect-square
                          ${selectedUrl === file.url ? 'border-indigo-600 ring-2 ring-indigo-200 shadow-sm' : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm'}
                        `}
                      >
                        {file.url ? (
                            <div className="w-full h-full relative">
                                <img
                                  src={file.url}
                                  alt={file.name}
                                  className="w-full h-full object-contain p-1"
                                />
                                {/* Overlay name on hover */}
                                <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-1 translate-y-full group-hover:translate-y-0 transition-transform">
                                    <p className="text-[10px] text-white text-center truncate">{file.name}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-50 text-xs text-gray-400">No Preview</div>
                        )}
                        
                        {selectedUrl === file.url && (
                          <div className="absolute top-2 right-2 bg-indigo-600 rounded-full p-0.5 shadow-sm z-10">
                            <Check size={12} className="text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer: Options & Actions */}
        <div className="bg-white p-4 border-t border-gray-200 flex flex-col sm:flex-row gap-4 items-center justify-between z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          
          {/* Dimension Inputs */}
          <div className="flex items-center gap-2 w-full sm:w-auto opacity-75 hover:opacity-100 transition-opacity">
            <div className="relative flex-1 sm:w-24">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase">W:</span>
              <input
                type="text"
                placeholder="auto"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <span className="text-gray-300 text-sm">×</span>
            <div className="relative flex-1 sm:w-24">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 uppercase">H:</span>
              <input
                type="text"
                placeholder="auto"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            
            {activeTab === 'upload' ? (
              <Button 
                variant="primary" 
                onClick={handleUpload} 
                disabled={!uploadFile || loading}
                loading={loading}
                icon={Upload}
              >
                Upload Here
              </Button>
            ) : (
              <Button 
                variant="primary" 
                onClick={() => {
                  if (selectedUrl) {
                    onSelectImage(selectedUrl, width, height);
                    onClose();
                  }
                }} 
                disabled={!selectedUrl}
              >
                Insert Selected
              </Button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
