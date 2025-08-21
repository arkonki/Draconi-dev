import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate limiter for individual users
const userRateLimiter = new RateLimiterMemory({
  points: 5, // Number of emails
  duration: 3600, // Per hour
});

// Rate limiter for overall system
const globalRateLimiter = new RateLimiterMemory({
  points: 100, // Total emails
  duration: 3600, // Per hour
});

export class EmailRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailRateLimitError';
  }
}

export async function checkRateLimit(userId: string): Promise<void> {
  try {
    // Check global rate limit first
    await globalRateLimiter.consume(1);
    
    // Then check user-specific rate limit
    await userRateLimiter.consume(userId);
  } catch (error) {
    throw new EmailRateLimitError(
      'Rate limit exceeded. Please try again later.'
    );
  }
}

export function getRateLimitInfo(userId: string) {
  const userPoints = userRateLimiter.getKey(userId);
  const globalPoints = globalRateLimiter.getKey('global');
  
  return {
    userEmailsRemaining: userPoints ? 5 - userPoints.consumedPoints : 5,
    globalEmailsRemaining: globalPoints ? 100 - globalPoints.consumedPoints : 100,
  };
}
