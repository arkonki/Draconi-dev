import { XCircle, X } from 'lucide-react';

interface ErrorMessageProps {
  message: string | null;
  onClose?: () => void; // Optional close handler
  title?: string;
  className?: string;
}

export function ErrorMessage({ message, onClose, title, className = '' }: ErrorMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={`bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 flex items-start justify-between ${className}`}
      role="alert"
    >
      <div className="flex items-center">
        <XCircle className="w-5 h-5 mr-2 flex-shrink-0" />
        <span className="block sm:inline">
          {title && <strong className="mr-1">{title}</strong>}
          {message}
        </span>
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
