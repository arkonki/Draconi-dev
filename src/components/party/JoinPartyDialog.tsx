import React, { useState } from 'react';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { X, LogIn } from 'lucide-react';

// The props remain the same. It receives the invite code as a string.
interface JoinPartyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (inviteCode: string) => void;
}

export function JoinPartyDialog({ isOpen, onClose, onJoin }: JoinPartyDialogProps) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [isJoining, setIsJoining] = useState(false); // State to handle loading feedback

  const handleJoin = async () => {
    setError('');
    // This regex is now more flexible. It captures any character sequence
    // after '/party/join/' until the next slash or the end of the string.
    // This works for both UUIDs and shorter custom codes (e.g., 'A7B2K9').
    const match = link.match(/party\/join\/([^/?]+)/);

    if (match && match[1]) {
      const inviteCode = match[1];
      setIsJoining(true); // Set loading state to true
      
      try {
        // The onJoin function is now expected to be async and handle the RPC call.
        // It should handle its own success/error states and potential redirection.
        await onJoin(inviteCode);
        
        // If onJoin resolves without error, we can close the dialog.
        // The parent component will handle alerts and redirection.
        handleClose();

      } catch (e) {
        // If onJoin throws an error (optional), you could handle it here.
        // However, it's better practice to handle it in the parent component
        // where the RPC call is made.
        console.error("Join operation failed:", e);
      } finally {
        setIsJoining(false); // Reset loading state
      }

    } else {
      setError('Invalid party invite link. Please paste the full link.');
    }
  };

  // Resets component state when closing
  const handleClose = () => {
    setLink('');
    setError('');
    setIsJoining(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity"
      aria-labelledby="join-party-title"
      role="dialog"
      aria-modal="true"
      onClick={handleClose} // Allow closing by clicking the overlay
    >
      <div
        className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4 transform transition-all"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the dialog
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
            disabled={isJoining}
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
            disabled={isJoining}
          />
          {error && <p id="link-error" className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-4 mt-6">
          <Button variant="secondary" onClick={handleClose} disabled={isJoining}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleJoin} disabled={!link || isJoining}>
            {isJoining ? 'Joining...' : 'Join Party'}
          </Button>
        </div>
      </div>
    </div>
  );
}