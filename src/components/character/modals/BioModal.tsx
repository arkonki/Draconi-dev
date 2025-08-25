import React, { useState, useEffect, useRef } from 'react';
import { useCharacterSheetStore } from '../../../stores/characterSheetStore';
import { X, User, BookOpen, Save, Edit3, Image as ImageIcon, AlertTriangle, MoreVertical, FileText, Star, HeartCrack, Pencil } from 'lucide-react';
import { Button } from '../../shared/Button';
import { LoadingSpinner } from '../../shared/LoadingSpinner';
import { Character } from '../../../types/character';

interface BioModalProps {
  onClose: () => void;
}

// Reusable component for displaying static details in the "driver's license"
const DetailItem = ({ label, value }: { label: string, value: React.ReactNode }) => (
  <div>
    <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</dt>
    <dd className="text-base text-gray-900">{value || <span className="text-gray-400 italic">N/A</span>}</dd>
  </div>
);

// Reusable component for displaying editable fields
const EditableDetailItem = ({ label, children, icon: Icon }: { label: string, children: React.ReactNode, icon: React.ElementType }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Icon className="w-4 h-4 text-gray-500" />
            {label}
        </label>
        {children}
    </div>
);


export function BioModal({ onClose }: BioModalProps) {
  const { character, updateCharacterData, isSaving, saveError } = useCharacterSheetStore();
  const [activeTab, setActiveTab] = useState<'bio' | 'backstory'>('bio');
  
  // --- NEW STATE FOR EDITING AND MENU ---
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [isEditingPortrait, setIsEditingPortrait] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Local state for controlled inputs remains the same
  const [portraitUrl, setPortraitUrl] = useState('');
  const [appearance, setAppearance] = useState('');
  const [memento, setMemento] = useState('');
  const [flaw, setFlaw] = useState('');
  const [backstory, setBackstory] = useState('');
  const [isEditingBackstory, setIsEditingBackstory] = useState(false);

  // Syncs local state from the store
  const syncStateFromCharacter = () => {
    if (character) {
      setPortraitUrl(character.portrait_url || '');
      setAppearance(character.appearance || '');
      setMemento(character.memento || '');
      setFlaw(character.flaw || '');
      setBackstory(character.notes || '');
    }
  };

  useEffect(() => {
    syncStateFromCharacter();
  }, [character]);
  
  // Effect to handle clicking outside the menu to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Consolidated save function
  const handleSave = async (updates: Partial<Character>) => {
    if (!character) return;
    await updateCharacterData(updates);
    // Exit all editing modes on successful save
    setIsEditingBio(false);
    setIsEditingPortrait(false);
    setIsEditingBackstory(false);
  };

  const handleCancel = () => {
    syncStateFromCharacter(); // Revert changes
    setIsEditingBio(false);
    setIsEditingPortrait(false);
  };


  // --- REBUILT Bio Tab ---
  const renderBioTab = () => (
    <div className="relative">
      {/* Options Menu */}
      <div className="absolute top-0 right-0" ref={menuRef}>
        <Button variant="ghost" size="icon" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <MoreVertical className="w-5 h-5" />
        </Button>
        {isMenuOpen && (
          <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
            <div className="py-1" role="menu" aria-orientation="vertical">
              <button onClick={() => { setIsEditingBio(true); setIsMenuOpen(false); }} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                <Pencil className="w-4 h-4"/> Edit Bio Details
              </button>
              <button onClick={() => { setIsEditingPortrait(true); setIsMenuOpen(false); }} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                <ImageIcon className="w-4 h-4"/> Edit Portrait URL
              </button>
            </div>
          </div>
        )}
      </div>

      {/* "Driver's License" Card */}
      <div className="flex flex-col md:flex-row gap-6 p-4 border rounded-lg shadow-sm bg-slate-50">
        {/* Left side: Portrait */}
        <div className="w-full md:w-1/3 flex-shrink-0">
          {isEditingPortrait ? (
             <div className="space-y-2">
                <label htmlFor="portraitUrl" className="block text-sm font-medium text-gray-700">Portrait URL</label>
                <input id="portraitUrl" type="text" value={portraitUrl} onChange={(e) => setPortraitUrl(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="https://..." />
                <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => { setIsEditingPortrait(false); syncStateFromCharacter(); }}>Cancel</Button>
                    <Button size="sm" onClick={() => handleSave({ portrait_url: portraitUrl })} disabled={isSaving}>{isSaving ? '...' : 'Save'}</Button>
                </div>
            </div>
          ) : portraitUrl ? (
            <img src={portraitUrl} alt="Character Portrait" className="w-full h-auto object-cover rounded-md border" onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/150/CCCCCC/FFFFFF?text=Invalid+Image'; }} />
          ) : (
            <button onClick={() => setIsEditingPortrait(true)} className="w-full h-48 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-gray-500 hover:bg-gray-100 hover:border-gray-400 transition-colors">
              <ImageIcon className="w-8 h-8 mb-2" />
              <span>Add Portrait</span>
            </button>
          )}
        </div>

        {/* Right side: Details */}
        <div className="flex-grow space-y-4">
          <h3 className="text-2xl font-bold text-gray-800 border-b pb-2">{character?.name}</h3>
          <div className="grid grid-cols-3 gap-4">
            <DetailItem label="Kin" value={character?.kin} />
            <DetailItem label="Profession" value={character?.profession} />
            <DetailItem label="Age" value={character?.age} />
          </div>
          
          {isEditingBio ? (
            <>
              <EditableDetailItem label="Appearance" icon={FileText}>
                <textarea value={appearance} onChange={(e) => setAppearance(e.target.value)} rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="A brief description..."/>
              </EditableDetailItem>
              <EditableDetailItem label="Memento" icon={Star}>
                <input type="text" value={memento} onChange={(e) => setMemento(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="A cherished item..."/>
              </EditableDetailItem>
              <EditableDetailItem label="Flaw" icon={HeartCrack}>
                <input type="text" value={flaw} onChange={(e) => setFlaw(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="A personal weakness..."/>
              </EditableDetailItem>
            </>
          ) : (
            <div className="space-y-3 pt-2">
                <div><h4 className="text-sm font-semibold text-gray-600">Appearance</h4><p className="text-gray-800 text-sm">{appearance || <i className="text-gray-500">Not set.</i>}</p></div>
                <div><h4 className="text-sm font-semibold text-gray-600">Memento</h4><p className="text-gray-800 text-sm">{memento || <i className="text-gray-500">Not set.</i>}</p></div>
                <div><h4 className="text-sm font-semibold text-gray-600">Flaw</h4><p className="text-gray-800 text-sm">{flaw || <i className="text-gray-500">Not set.</i>}</p></div>
            </div>
          )}
        </div>
      </div>
      
      {/* Global Save/Cancel for Bio Edit Mode */}
      {isEditingBio && (
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
          <Button icon={Save} onClick={() => handleSave({ appearance, memento, flaw })} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}
    </div>
  );

  // --- Backstory Tab remains unchanged ---
  const renderBackstoryTab = () => (
    <>
      <div className="flex justify-end mb-4 gap-2">
        {isEditingBackstory ? (
          <>
            <Button variant="secondary" onClick={() => { setBackstory(character?.notes || ''); setIsEditingBackstory(false); }}>Cancel</Button>
            <Button onClick={() => handleSave({ notes: backstory })} disabled={isSaving} icon={Save}>{isSaving ? 'Saving...' : 'Save Backstory'}</Button>
          </>
        ) : (
          <Button onClick={() => setIsEditingBackstory(true)} icon={Edit3}>Edit Backstory</Button>
        )}
      </div>
      {isEditingBackstory ? (
        <textarea value={backstory} onChange={(e) => setBackstory(e.target.value)} rows={15} className="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Write your character's life story here..." />
      ) : (
        <div className="p-4 bg-gray-50 rounded-md border min-h-[200px]">
          {backstory ? (
            <p className="text-gray-700 whitespace-pre-wrap">{backstory}</p>
          ) : (
            <p className="text-gray-500 italic">No backstory has been written yet.</p>
          )}
        </div>
      )}
    </>
  );

  if (!character) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl h-[80vh] flex items-center justify-center">
          <LoadingSpinner /><span className="ml-2">Loading character data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 border-b">
            <div><h2 className="text-xl font-bold text-gray-800">Character Biography</h2><p className="text-sm text-gray-500">View and edit personal details and history.</p></div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close modal"><X className="w-6 h-6" /></Button>
        </div>
        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <nav className="-mb-px flex space-x-8" aria-label="Tabs">
            <button onClick={() => setActiveTab('bio')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${activeTab === 'bio' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><User className="w-5 h-5" /> Bio</button>
            <button onClick={() => setActiveTab('backstory')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${activeTab === 'backstory' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}><BookOpen className="w-5 h-5" /> Backstory</button>
          </nav>
        </div>
        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {saveError && (<div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded-md flex items-center gap-2"><AlertTriangle className="w-5 h-5" /><div><p className="font-semibold">Save Error</p><p className="text-sm">{saveError}</p></div></div>)}
          {activeTab === 'bio' ? renderBioTab() : renderBackstoryTab()}
        </div>
      </div>
    </div>
  );
}
