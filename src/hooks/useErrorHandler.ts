import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorLogger from '../lib/errors/ErrorLogger';
import { useApp } from '../contexts/AppContext';

export function useErrorHandler() {
  const navigate = useNavigate();
  const { setGlobalError } = useApp();

  const handleError = useCallback((error: unknown, context?: {
    action?: string;
    redirect?: string;
    showError?: boolean;
    critical?: boolean;
  }) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Log the error
    ErrorLogger.handleError(error, {
      action: context?.action,
      additionalData: { critical: context?.critical }
    });

    // Show error message if requested
    if (context?.showError !== false) {
      setGlobalError(errorMessage);
    }

    // Redirect if specified
    if (context?.redirect) {
      navigate(context.redirect);
    }

    // Handle critical errors
    if (context?.critical) {
      navigate('/error', { state: { error: errorMessage } });
    }
  }, [navigate, setGlobalError]);

  const handleAuthError = useCallback((error: unknown, context?: {
    action?: string;
    redirect?: string;
  }) => {
    ErrorLogger.handleAuthError(error, {
      action: context?.action
    });

    const errorMessage = error instanceof Error ? error.message : String(error);
    setGlobalError(errorMessage);

    // Redirect to login for auth errors
    navigate(context?.redirect || '/login');
  }, [navigate, setGlobalError]);

  const handleNetworkError = useCallback((error: unknown, context?: {
    action?: string;
    retry?: () => Promise<void>;
  }) => {
    ErrorLogger.handleNetworkError(error, {
      action: context?.action
    });

    const errorMessage = 'Network error. Please check your connection and try again.';
    setGlobalError(errorMessage);

    // Implement retry logic if provided
    if (context?.retry) {
      setTimeout(context.retry, 1000);
    }
  }, [setGlobalError]);

  return {
    handleError,
    handleAuthError,
    handleNetworkError
  };
}
