import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ErrorFallbackProps {
  error: Error; // Still expects an error prop if used elsewhere
  resetErrorBoundary?: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  // This component might still be useful if you use a library like 'react-error-boundary'
  // or if you manually render it and pass an error object.
  // For now, it's not rendered by the main App ErrorBoundary.
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
          <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
        </div>
        
        <p className="text-gray-600 mb-4">
          We apologize for the inconvenience. The application has encountered an unexpected error.
        </p>

        <div className="mb-6">
          <div className="bg-red-50 border border-red-100 rounded-lg p-4">
            <p className="text-sm font-medium text-red-800 mb-2">Error Details:</p>
            {/* Add a check for error before accessing message */}
            <p className="text-sm text-red-700 font-mono break-all">
              {error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {resetErrorBoundary && (
            <button
              onClick={resetErrorBoundary}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              Try Again
            </button>
          )}
          
          <Link
            to="/"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Home className="w-5 h-5" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
