import { z } from 'zod';
import { supabase } from '../supabase';
import { passwordSchema } from './validation';

// Password history validation
const PASSWORD_HISTORY_LENGTH = 5;
const PASSWORD_CHANGE_ATTEMPTS = 3;
const PASSWORD_CHANGE_WINDOW = 15 * 60 * 1000; // 15 minutes

// Rate limiting store
const rateLimitStore = new Map<string, { attempts: number; resetTime: number }>();

// Password history store (in-memory for demo, should use database in production)
const passwordHistoryStore = new Map<string, string[]>();

// Password change schema with current password verification
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
}).refine((data) => {
  // Check for sequential patterns
  const sequential = /(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i;
  return !sequential.test(data.newPassword);
}, {
  message: "Password cannot contain sequential patterns",
  path: ["newPassword"],
}).refine((data) => {
  // Check for common dictionary words
  const commonWords = ['password', 'admin', 'user', 'login', '123456', 'qwerty'];
  return !commonWords.some(word => data.newPassword.toLowerCase().includes(word));
}, {
  message: "Password cannot contain common words",
  path: ["newPassword"],
});

// Check rate limit
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);

  if (entry && now < entry.resetTime) {
    if (entry.attempts >= PASSWORD_CHANGE_ATTEMPTS) {
      return false;
    }
    entry.attempts += 1;
  } else {
    rateLimitStore.set(userId, {
      attempts: 1,
      resetTime: now + PASSWORD_CHANGE_WINDOW
    });
  }

  return true;
}

// Check password history
function checkPasswordHistory(userId: string, newPassword: string): boolean {
  const history = passwordHistoryStore.get(userId) || [];
  return !history.includes(newPassword);
}

// Add password to history
function addToPasswordHistory(userId: string, password: string) {
  const history = passwordHistoryStore.get(userId) || [];
  history.push(password);
  if (history.length > PASSWORD_HISTORY_LENGTH) {
    history.shift();
  }
  passwordHistoryStore.set(userId, history);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Check rate limit
    if (!checkRateLimit(userId)) {
      throw new Error('Too many password change attempts. Please try again later.');
    }

    // Validate input
    const validationResult = passwordChangeSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword
    });

    if (!validationResult.success) {
      throw new Error(validationResult.error.errors[0].message);
    }

    // Check password history
    if (!checkPasswordHistory(userId, newPassword)) {
      throw new Error('Password has been used recently. Please choose a different password.');
    }

    // Verify current password
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: '', // Will be filled from session
      password: currentPassword
    });

    if (verifyError) {
      throw new Error('Current password is incorrect');
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (updateError) {
      throw new Error('Failed to update password');
    }

    // Add new password to history
    addToPasswordHistory(userId, newPassword);

    // Send email notification (implement in production)
    // await sendPasswordChangeNotification(userId);

    return {
      success: true,
      message: 'Password changed successfully'
    };

  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to change password'
    };
  }
}
