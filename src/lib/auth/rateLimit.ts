// Rate limiting configuration
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

interface RateLimitEntry {
  attempts: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function checkRateLimit(identifier: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clear expired entries
  if (entry && now > entry.resetTime) {
    rateLimitStore.delete(identifier);
    return true;
  }

  // Check if rate limited
  if (entry && entry.attempts >= MAX_ATTEMPTS) {
    return false;
  }

  // Update or create entry
  if (!entry) {
    rateLimitStore.set(identifier, {
      attempts: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
  } else {
    entry.attempts += 1;
  }

  return true;
}

export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // Clean up every 5 minutes
