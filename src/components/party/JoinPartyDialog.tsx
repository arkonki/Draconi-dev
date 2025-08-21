import React, { useState } from 'react';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { X, LogIn } from 'lucide-react';

interface JoinPartyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (partyId: string) => void;
}

export function JoinPartyDialog({ isOpen, onClose, onJoin }: JoinPartyDialogProps) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    setError('');
    // Extracts the UUID from a URL path like /party/join/uuid
    const match = link.match(/party\/join\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);

    if (match && match[1]) {
      onJoin(match[1]);
      setLink(''); // Reset on successful join
    } else {
      setError('Invalid party invite link. Please paste the full link.');
    }
  };

  const handleClose = () => {
    setLink('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity"
      aria-labelledby="join-party-title"
      role="dialog"
      aria-modal="true"
      onClick={handleClose}
    >
      <div
        className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4 transform transition-all"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        <div className="flex justify-between items-center mb-4">
          <h2 id="join-party-title" className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <LogIn className="w-6 h-6 text-blue-600" />
            Join an Adventure Party
          </h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-gray-600 mb-4">
          Paste the invite link you received from your Dungeon Master to join their party.
        </p>

        <div>
          <label htmlFor="party-link" className="sr-only">
            Party Invite Link
          </label>
          <Input
            id="party-link"
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://.../party/join/..."
            className="w-full"
            aria-describedby="link-error"
          />
          {error && <p id="link-error" className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-4 mt-6">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleJoin} disabled={!link}>
            Join Party
          </Button>
        </div>
      </div>
    </div>
  );
}
