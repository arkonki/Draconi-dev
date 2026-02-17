import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  signupSchema,
  registrationSchema,
  passwordChangeSchema,
} from './validation';

describe('Auth Validation Schemas', () => {
  describe('loginSchema', () => {
    it('validates correct login data', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'Password123!',
      });

      expect(result.success).toBe(true);
    });

    it('invalidates missing email', () => {
      const result = loginSchema.safeParse({
        password: 'Password123!',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('signupSchema', () => {
    it('validates correct signup data', () => {
      const result = signupSchema.safeParse({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'player',
      });

      expect(result.success).toBe(true);
    });

    it('invalidates mismatched passwords', () => {
      const result = signupSchema.safeParse({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123!',
        confirmPassword: 'DifferentPassword123!',
        role: 'player',
      });

      expect(result.success).toBe(false);
      expect(result.error?.flatten().fieldErrors.confirmPassword?.[0]).toBe(
        "Passwords don't match"
      );
    });
  });

  describe('registrationSchema alias', () => {
    it('matches signup schema behavior', () => {
      const result = registrationSchema.safeParse({
        username: 'aliasuser',
        email: 'alias@example.com',
        password: 'Password123!',
        confirmPassword: 'Password123!',
        role: 'dm',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('passwordChangeSchema', () => {
    it('validates correct password change data', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'NewPassword123!',
      });

      expect(result.success).toBe(true);
    });

    it('invalidates mismatched new passwords', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword123!',
        confirmPassword: 'DifferentPassword123!',
      });

      expect(result.success).toBe(false);
      expect(result.error?.flatten().fieldErrors.confirmPassword?.[0]).toBe(
        "Passwords don't match"
      );
    });

    it('invalidates short new password', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'short1!',
        confirmPassword: 'short1!',
      });

      expect(result.success).toBe(false);
      expect(result.error?.flatten().fieldErrors.newPassword?.[0]).toContain(
        'at least 8 characters'
      );
    });
  });
});
