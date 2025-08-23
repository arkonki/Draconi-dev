import React, { useState } from 'react';
import { Button } from '../shared/Button';
import { Input } from '../shared/Input';
import { X, Copy, Check, Link } from 'lucide-react';

interface InvitePlayerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  partyId: string;
}

export function InvitePlayerDialog({ isOpen, onClose, partyId }: InvitePlayerDialogProps) {
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}/party/join/${partyId}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-md m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Link className="w-6 h-6 text-blue-600" />
            Invite Player
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:bg-gray-200"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-gray-600 mb-4">
          Share this link with a player to invite them to your party. They will be prompted to select one of their available characters to join with.
        </p>
        <div className="flex items-center space-x-2">
          <Input
            id="invite-link"
            type="text"
            value={inviteLink}
            readOnly
            className="w-full bg-gray-100"
          />
          <Button variant="secondary" onClick={handleCopy} icon={copied ? Check : Copy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
