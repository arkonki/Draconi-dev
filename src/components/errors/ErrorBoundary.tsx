import React, { Component, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import ErrorLogger from '../../lib/errors/ErrorLogger';
import { Link } from 'react-router-dom';

interface Props {
  children: React.ReactNode;
  // Fallback prop is optional now
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    ErrorLogger.handleError(error, {
      action: 'render',
      additionalData: { componentStack: errorInfo.componentStack }
    });
    // Optionally update errorInfo state if needed for display
    // this.setState({ errorInfo });
  }

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // If a fallback prop IS provided, render it (still doesn't pass error automatically)
      // This path won't be taken by App.tsx anymore
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Render the default error UI using the caught error from state
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

            {/* Check if error exists before accessing its properties */}
            {this.state.error && (
              <div className="mb-6">
                <div className="bg-red-50 border border-red-100 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-800 mb-2">Error Details:</p>
                  <p className="text-sm text-red-700 font-mono break-all">
                    {this.state.error.message || 'No error message available'}
                  </p>
                  {/* Optionally display stack trace in development */}
                  {/* {process.env.NODE_ENV === 'development' && this.state.error.stack && (
                    <pre className="mt-2 text-xs text-red-600 overflow-auto">
                      {this.state.error.stack}
                    </pre>
                  )} */}
                  {/* Optionally display component stack */}
                  {/* {process.env.NODE_ENV === 'development' && this.state.errorInfo?.componentStack && (
                     <pre className="mt-2 text-xs text-red-600 overflow-auto">
                       {this.state.errorInfo.componentStack}
                     </pre>
                  )} */}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleRefresh}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-5 h-5" />
                Refresh Page
              </button>
              
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

    return this.props.children;
  }
}
