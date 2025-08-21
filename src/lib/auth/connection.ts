// Connection check utility
export async function checkConnection(timeout = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(import.meta.env.VITE_SUPABASE_URL, {
      method: 'HEAD',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (err) {
    console.error('Connection check failed:', err);
    return false;
  }
}

// Retry utility for auth operations
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 2,
  delayMs = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const isConnected = await checkConnection();
      if (!isConnected) {
        throw new Error('No connection available');
      }
      
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Operation failed');
      
      // Don't retry for invalid credentials
      if (lastError.message.includes('Invalid') || 
          lastError.message.includes('not found') ||
          lastError.message.includes('Too many')) {
        throw lastError;
      }
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Linear backoff
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError!;
}
