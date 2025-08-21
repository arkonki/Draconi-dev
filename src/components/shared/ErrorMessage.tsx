import React from 'react';
import { XCircle, X } from 'lucide-react';

interface ErrorMessageProps {
  message: string | null;
  onClose?: () => void; // Optional close handler
}

export function ErrorMessage({ message, onClose }: ErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 flex items-start justify-between"
      role="alert"
    >
      <div className="flex items-center">
        <XCircle className="w-5 h-5 mr-2 flex-shrink-0" />
        <span className="block sm:inline">{message}</span>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-4 p-1 text-red-500 hover:text-red-700 hover:bg-red-200 rounded-full transition-colors"
          aria-label="Close error message"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
