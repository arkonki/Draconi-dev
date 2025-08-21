import { User } from '@supabase/supabase-js';

interface ErrorContext {
  user?: User | null;
  path?: string;
  action?: string;
  timestamp?: string;
  additionalData?: Record<string, unknown>;
}

interface ErrorReport {
  error: Error;
  context: ErrorContext;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private readonly environment: string;

  private constructor() {
    this.environment = import.meta.env.MODE || 'development';
  }

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  logError(error: Error, context: ErrorContext = {}, severity: ErrorReport['severity'] = 'medium'): void {
    const errorReport: ErrorReport = {
      error,
      context: {
        ...context,
        timestamp: new Date().toISOString(),
        path: window.location.pathname,
      },
      severity,
    };

    // Log to console in development
    if (this.environment === 'development') {
      console.error('Error Report:', {
        message: error.message,
        stack: error.stack,
        ...errorReport.context,
        severity,
      });
    }

    // In production, you would send this to your error tracking service
    if (this.environment === 'production') {
      // Example: Send to error tracking service
      this.sendToErrorTrackingService(errorReport);
    }
  }

  private async sendToErrorTrackingService(errorReport: ErrorReport): Promise<void> {
    try {
      // This is where you would integrate with your error tracking service
      // Example: Sentry, LogRocket, etc.
      console.error('Production Error:', errorReport);
    } catch (err) {
      // Fallback logging if error service fails
      console.error('Failed to send error report:', err);
    }
  }

  // Utility method for handling common error patterns
  static handleError(error: unknown, context?: ErrorContext): void {
    const logger = ErrorLogger.getInstance();
    
    if (error instanceof Error) {
      logger.logError(error, context);
    } else {
      logger.logError(new Error(String(error)), context);
    }
  }

  // Utility method for handling network errors
  static handleNetworkError(error: unknown, context?: ErrorContext): void {
    const logger = ErrorLogger.getInstance();
    
    if (error instanceof Error) {
      const isNetworkError = error.message.toLowerCase().includes('network') ||
                            error.message.toLowerCase().includes('connection') ||
                            error.message.toLowerCase().includes('offline');
      
      logger.logError(error, {
        ...context,
        additionalData: { isNetworkError }
      }, isNetworkError ? 'high' : 'medium');
    }
  }

  // Utility method for handling authentication errors
  static handleAuthError(error: unknown, context?: ErrorContext): void {
    const logger = ErrorLogger.getInstance();
    
    if (error instanceof Error) {
      const isAuthError = error.message.toLowerCase().includes('auth') ||
                         error.message.toLowerCase().includes('unauthorized') ||
                         error.message.toLowerCase().includes('forbidden');
      
      logger.logError(error, {
        ...context,
        additionalData: { isAuthError }
      }, isAuthError ? 'high' : 'medium');
    }
  }
}

export default ErrorLogger;
