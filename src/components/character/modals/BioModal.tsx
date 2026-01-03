import React, { useState, useEffect, useRef } from 'react';
import { useCharacterSheetStore } from '../../../stores/characterSheetStore';
import { 
  X, User, BookOpen, Save, Edit3, AlertTriangle, FileText, Star, HeartCrack, Camera, Upload, Loader, MoveVertical, Image as ImageIcon
} from 'lucide-react';
import { Button } from '../../shared/Button';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { supabase } from '../../../lib/supabase';

interface BioModalProps {
  onClose: () => void;
}

// --- HELPER: Parse Position from URL ---
// We store position as a query param (e.g., image.jpg?pos=20) to avoid DB schema changes
const parsePortraitData = (fullUrl: string | null) => {
  if (!fullUrl) return { url: '', pos: 50 };
  const [url, query] = fullUrl.split('?pos=');
  const pos = query ? parseInt(query) : 50; // Default center (50%)
  return { url, pos: isNaN(pos) ? 50 : pos };
};

// --- SUB-COMPONENT: PORTRAIT EDITOR ---

const PortraitEditor = ({ 
  currentUrl, 
  currentPos, 
  onSave, 
  onCancel, 
  isSaving 
}: { 
  currentUrl: string, 
  currentPos: number, 
  onSave: (url: string, pos: number) => void, 
  onCancel: () => void, 
  isSaving: boolean 
}) => {
  const [tempUrl, setTempUrl] = useState(currentUrl);
  const [tempPos, setTempPos] = useState(currentPos);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    setIsUploading(true);
    setError(null);

    try {
      // Create safe filename with timestamp
      const fileExt = file.name.split('.').pop();
      const fileName = `portrait-${Date.now()}.${fileExt}`;
      const filePath = `portraits/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('images').getPublicUrl(filePath);
      setTempUrl(data.publicUrl);
      setTempPos(50); // Reset position on new image
    } catch (err: any) {
      console.error("Upload failed:", err);
      setError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 animate-in slide-in-from-top-2 space-y-4">
      
      {/* 1. Image Preview with Live Positioning */}
      <div className="flex gap-4">
        <div className="relative w-24 h-32 bg-gray-200 rounded-lg overflow-hidden border border-gray-300 shadow-inner flex-shrink-0">
          {tempUrl ? (
            <img 
              src={tempUrl} 
              alt="Preview" 
              className="w-full h-full object-cover transition-none"
              style={{ objectPosition: `center ${tempPos}%` }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400"><User /></div>
          )}
        </div>

        <div className="flex-1 space-y-3">
          {/* Position Slider */}
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-1">
              <MoveVertical size={12} /> Position (Y-Axis)
            </label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={tempPos} 
              onChange={(e) => setTempPos(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              disabled={!tempUrl}
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>Top</span>
              <span>Center</span>
              <span>Bottom</span>
            </div>
          </div>

          {/* URL Input */}
          <div>
             <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Image URL</label>
             <input 
                type="text" 
                value={tempUrl} 
                onChange={(e) => setTempUrl(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="https://..."
             />
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {/* Buttons */}
      <div className="space-y-2 pt-2 border-t border-gray-200">
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleUpload} 
            className="hidden" 
            accept="image/*" 
        />
        <Button 
            variant="secondary" 
            size="sm" 
            fullWidth
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            icon={isUploading ? Loader : Upload}
        >
            {isUploading ? 'Uploading...' : 'Upload New Image'}
        </Button>

        <div className="flex gap-2">
            <Button size="sm" fullWidth onClick={() => onSave(tempUrl, tempPos)} disabled={isSaving || isUploading}>Save Portrait</Button>
            <Button size="sm" variant="ghost" fullWidth onClick={onCancel} disabled={isUploading}>Cancel</Button>
        </div>
      </div>
    </div>
  );
};

// --- HELPER COMPONENT ---

const EditableDetailItem = ({ label, children, icon: Icon }: { label: string, children: React.ReactNode, icon: React.ElementType }) => (
    <div className="space-y-1">
        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-1">
            <Icon size={14} className="text-indigo-500" />
            {label}
        </label>
        {children}
    </div>
);

// --- MAIN COMPONENT ---

export function BioModal({ onClose }: BioModalProps) {
  const { character, updateCharacterData, isSaving, saveError } = useCharacterSheetStore();
  const [activeTab, setActiveTab] = useState<'bio' | 'backstory'>('bio');
  
  // Editing States
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isEditingPortrait, setIsEditingPortrait] = useState(false);
  const [isEditingBackstory, setIsEditingBackstory] = useState(false);

  // Form Data
  const [portraitUrl, setPortraitUrl] = useState('');
  const [portraitPos, setPortraitPos] = useState(50);
  const [appearance, setAppearance] = useState('');
  const [memento, setMemento] = useState('');
  const [flaw, setFlaw] = useState('');
  const [backstory, setBackstory] = useState('');

  // Sync state
  const syncStateFromCharacter = () => {
    if (character) {
      const { url, pos } = parsePortraitData(character.portrait_url);
      setPortraitUrl(url);
      setPortraitPos(pos);
      setAppearance(character.appearance || '');
      setMemento(character.memento || '');
      setFlaw(character.flaw || '');
      setBackstory(character.notes || '');
    }
  };

  useEffect(() => { syncStateFromCharacter(); }, [character]);

  // --- ACTIONS ---

  const handleSaveBio = async () => {
    if (!character) return;
    await updateCharacterData({ appearance, memento, flaw });
    setIsEditingBio(false);
  };

  const handleSavePortrait = async (newUrl: string, newPos: number) => {
    if (!character) return;
    // We combine the URL and the position into a single string to avoid DB schema changes
    // If newPos is 50 (default), we don't need to append it to keep URL clean, 
    // but appending it ensures consistency if the user explicitly set it.
    const finalString = newPos === 50 ? newUrl : `${newUrl}?pos=${newPos}`;
    
    await updateCharacterData({ portrait_url: finalString });
    setPortraitUrl(newUrl);
    setPortraitPos(newPos);
    setIsEditingPortrait(false);
  };

  const handleSaveBackstory = async () => {
    if (!character) return;
    await updateCharacterData({ notes: backstory });
    setIsEditingBackstory(false);
  };

  const handleCancel = () => {
    syncStateFromCharacter();
    setIsEditingBio(false);
    setIsEditingPortrait(false);
    setIsEditingBackstory(false);
  };

  // --- RENDER CONTENT ---

  if (!character) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const renderBioTab = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* TOP SECTION: PORTRAIT & CORE STATS */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        
        {/* Left Column: Portrait */}
        <div className="w-full md:w-1/3 flex flex-col gap-3">
            
            {/* The Portrait Display */}
            {!isEditingPortrait ? (
                <div className="group relative">
                    <div className="relative aspect-[3/4] bg-gray-100 rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm group-hover:border-indigo-300 transition-all">
                        {portraitUrl ? (
                            <img 
                                src={portraitUrl} 
                                alt={character.name} 
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                style={{ objectPosition: `center ${portraitPos}%` }}
                                onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/300x400/f3f4f6/9ca3af?text=No+Image'; }} 
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                                <User size={48} strokeWidth={1.5} />
                                <span className="text-xs mt-2 font-medium">No Portrait</span>
                            </div>
                        )}
                        
                        {/* Edit Overlay */}
                        <button 
                            onClick={() => setIsEditingPortrait(true)}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold gap-2 backdrop-blur-[2px]"
                        >
                            <Camera size={20} /> Edit / Position
                        </button>
                    </div>
                </div>
            ) : (
                <PortraitEditor 
                    currentUrl={portraitUrl}
                    currentPos={portraitPos}
                    onSave={handleSavePortrait}
                    onCancel={() => setIsEditingPortrait(false)}
                    isSaving={isSaving}
                />
            )}
        </div>

        {/* Right Column: Details */}
        <div className="flex-1 w-full">
            <div className="flex justify-between items-end mb-6 border-b border-gray-100 pb-4">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">{character.name}</h2>
                    <p className="text-gray-500 font-medium">{character.kin} • {character.profession}</p>
                </div>
                {!isEditingBio && (
                    <Button variant="secondary" size="sm" icon={Edit3} onClick={() => setIsEditingBio(true)}>Edit Details</Button>
                )}
            </div>

            {/* Read-Only Grid */}
            {!isEditingBio ? (
                <div className="grid grid-cols-1 gap-6">
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <FileText size={14} className="text-indigo-500"/> Appearance
                        </h4>
                        <p className="text-gray-700 text-sm leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100 min-h-[80px]">
                            {appearance || <span className="text-gray-400 italic">No description provided.</span>}
                        </p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg">
                            <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1 flex items-center gap-2">
                                <Star size={14} /> Memento
                            </h4>
                            <p className="text-sm font-medium text-amber-900">{memento || "None"}</p>
                        </div>
                        <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
                            <h4 className="text-xs font-bold text-red-700 uppercase tracking-wider mb-1 flex items-center gap-2">
                                <HeartCrack size={14} /> Flaw
                            </h4>
                            <p className="text-sm font-medium text-red-900">{flaw || "None"}</p>
                        </div>
                    </div>
                </div>
            ) : (
                // Edit Mode
                <div className="space-y-5 bg-white p-1">
                    <EditableDetailItem label="Appearance" icon={FileText}>
                        <textarea 
                            value={appearance} 
                            onChange={(e) => setAppearance(e.target.value)} 
                            rows={4} 
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                            placeholder="Describe your character..."
                        />
                    </EditableDetailItem>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <EditableDetailItem label="Memento" icon={Star}>
                            <input 
                                type="text" 
                                value={memento} 
                                onChange={(e) => setMemento(e.target.value)} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                                placeholder="A cherished item..."
                            />
                        </EditableDetailItem>
                        <EditableDetailItem label="Flaw" icon={HeartCrack}>
                            <input 
                                type="text" 
                                value={flaw} 
                                onChange={(e) => setFlaw(e.target.value)} 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none"
                                placeholder="A personal weakness..."
                            />
                        </EditableDetailItem>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <Button variant="ghost" onClick={handleCancel}>Cancel</Button>
                        <Button icon={Save} onClick={handleSaveBio} disabled={isSaving} variant="primary">
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );

  const renderBackstoryTab = () => (
    <div className="h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center mb-4 px-1">
         <h3 className="font-bold text-gray-700">Character History</h3>
         {!isEditingBackstory ? (
            <Button size="sm" variant="secondary" icon={Edit3} onClick={() => setIsEditingBackstory(true)}>Edit Text</Button>
         ) : (
            <div className="flex gap-2">
               <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
               <Button size="sm" variant="primary" icon={Save} onClick={handleSaveBackstory} disabled={isSaving}>Save</Button>
            </div>
         )}
      </div>

      {isEditingBackstory ? (
        <textarea 
            value={backstory} 
            onChange={(e) => setBackstory(e.target.value)} 
            className="flex-grow w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none font-serif text-gray-800 leading-relaxed text-lg bg-gray-50 focus:bg-white transition-colors" 
            placeholder="Write your legend here..." 
            autoFocus
        />
      ) : (
        <div className="flex-grow bg-gray-50 rounded-xl border border-gray-200 p-6 overflow-y-auto shadow-inner">
          {backstory ? (
            <div className="prose prose-stone max-w-none font-serif text-gray-800 leading-loose whitespace-pre-wrap text-lg">
                {backstory}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <BookOpen size={48} className="mb-4 opacity-20" />
                <p className="text-lg font-medium italic">No backstory recorded yet.</p>
                <Button variant="ghost" onClick={() => setIsEditingBackstory(true)} className="mt-4">Start Writing</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 sm:p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden border border-gray-200" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-white z-10">
            <div className="flex items-center gap-4">
               <div className="w-10 h-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-bold text-xl shadow-md">
                  {character.name.slice(0,1)}
               </div>
               <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                  <button onClick={() => setActiveTab('bio')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${activeTab === 'bio' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                     Details
                  </button>
                  <button onClick={() => setActiveTab('backstory')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${activeTab === 'backstory' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                     Backstory
                  </button>
               </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><X size={24} /></button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 overflow-y-auto bg-white flex-grow relative">
           {saveError && (
               <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                   <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                   <div>
                       <p className="font-bold text-sm">Error Saving Data</p>
                       <p className="text-sm mt-1">{saveError}</p>
                   </div>
               </div>
           )}
           
           {activeTab === 'bio' ? renderBioTab() : renderBackstoryTab()}
        </div>

      </div>
    </div>
  );
}
