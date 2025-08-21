import { describe, it, expect } from 'vitest';
import { loginSchema, registrationSchema, passwordChangeSchema } from './validation'; // Corrected import name

describe('Auth Validation Schemas', () => {
  // --- Login Schema Tests ---
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const result = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'Password123!', // Use a valid password for consistency
      });
      expect(result.success).toBe(true);
    });

    it('should invalidate missing email', () => {
      const result = loginSchema.safeParse({ password: 'Password123!' });
      expect(result.success).toBe(false);
      // Zod's default required message
      expect(result.error?.errors[0].message).toBe('Required');
    });

    it('should invalidate invalid email format', () => {
      const result = loginSchema.safeParse({ email: 'invalid-email', password: 'Password123!' });
      expect(result.success).toBe(false);
      // Updated expected message to match Zod's default
      expect(result.error?.errors[0].message).toBe('Invalid email address');
    });

    it('should invalidate missing password', () => {
      const result = loginSchema.safeParse({ email: 'test@example.com' });
      expect(result.success).toBe(false);
      // Zod's default required message
      expect(result.error?.errors[0].message).toBe('Required');
    });
  });

  // --- Register Schema Tests ---
  describe('registrationSchema', () => { // Corrected describe block name
    it('should validate correct registration data', () => {
      const result = registrationSchema.safeParse({ // Corrected schema name
        username: 'testuser',
        email: 'test@example.com',
        password: 'ValidPassword123!', // Use a valid password
      });
      // Note: registrationSchema doesn't have confirmPassword, passwordChangeSchema does
      expect(result.success).toBe(true);
    });

    it('should invalidate missing username', () => {
      const result = registrationSchema.safeParse({ // Corrected schema name
        email: 'test@example.com',
        password: 'ValidPassword123!',
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Required'); // Default required message
    });

     it('should invalidate username less than 3 characters', () => {
      const result = registrationSchema.safeParse({ // Corrected schema name
        username: 'us',
        email: 'test@example.com',
        password: 'ValidPassword123!',
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Username must be at least 3 characters');
    });

    it('should invalidate missing email', () => {
      const result = registrationSchema.safeParse({ // Corrected schema name
        username: 'testuser',
        password: 'ValidPassword123!',
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Required'); // Default required message
    });

    it('should invalidate invalid email format', () => {
      const result = registrationSchema.safeParse({ // Corrected schema name
        username: 'testuser',
        email: 'invalid-email',
        password: 'ValidPassword123!',
      });
      expect(result.success).toBe(false);
      // Updated expected message to match Zod's default
      expect(result.error?.errors[0].message).toBe('Invalid email address');
    });

    it('should invalidate password less than 12 characters', () => { // Updated description
      const result = registrationSchema.safeParse({ // Corrected schema name
        username: 'testuser',
        email: 'test@example.com',
        password: 'Short1!', // Invalid password
      });
      expect(result.success).toBe(false);
      // Check against the actual rule in passwordSchema
      expect(result.error?.errors[0].message).toContain('Password must be at least 12 characters');
    });

    // Note: registrationSchema doesn't have a confirmPassword field or refine check
    // Remove the non-matching passwords test for registrationSchema
    /*
    it('should invalidate non-matching passwords', () => {
      const result = registrationSchema.safeParse({
        username: 'testuser',
        email: 'test@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'DifferentPassword456!', // This field doesn't exist on registrationSchema
      });
      expect(result.success).toBe(false);
      // This test is not applicable to registrationSchema
    });
    */
  });

  // --- Password Change Schema Tests ---
  describe('passwordChangeSchema', () => {
    it('should validate correct password change data', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldPassword123', // Doesn't need validation here
        newPassword: 'NewValidPassword123!', // Valid password
        confirmPassword: 'NewValidPassword123!', // Correct field name and matching valid password
      });
      // Check the result directly
      if (!result.success) {
        console.error("Password change validation failed unexpectedly:", result.error.flatten());
      }
      expect(result.success).toBe(true);
    });

    it('should invalidate missing current password', () => {
      const result = passwordChangeSchema.safeParse({
        newPassword: 'NewValidPassword123!',
        confirmPassword: 'NewValidPassword123!', // Correct field name
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toBe('Required'); // Default required message
    });

    it('should invalidate new password less than 12 characters', () => { // Updated description
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldPassword123',
        newPassword: 'Short1!', // Invalid password
        confirmPassword: 'Short1!', // Correct field name
      });
      expect(result.success).toBe(false);
      // Check against the actual rule in passwordSchema
      expect(result.error?.errors[0].message).toContain('Password must be at least 12 characters');
    });

    it('should invalidate non-matching new passwords', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldPassword123',
        // Use passwords that meet the base requirements but don't match
        newPassword: 'NewValidPassword123!',
        confirmPassword: 'AnotherValidPass456?', // Correct field name, valid but different
      });
      expect(result.success).toBe(false);
      // Check the refine message
      expect(result.error?.flatten().fieldErrors.confirmPassword?.[0]).toBe("Passwords don't match");
    });

     it('should invalidate new password without uppercase', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldPassword123',
        newPassword: 'invalidpassword123!',
        confirmPassword: 'invalidpassword123!',
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Password must contain at least one uppercase letter');
    });

     it('should invalidate new password without lowercase', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldPassword123',
        newPassword: 'INVALIDPASSWORD123!',
        confirmPassword: 'INVALIDPASSWORD123!',
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Password must contain at least one lowercase letter');
    });

     it('should invalidate new password without number', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldPassword123',
        newPassword: 'InvalidPassword!',
        confirmPassword: 'InvalidPassword!',
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Password must contain at least one number');
    });

     it('should invalidate new password without special character', () => {
      const result = passwordChangeSchema.safeParse({
        currentPassword: 'oldPassword123',
        newPassword: 'InvalidPassword123',
        confirmPassword: 'InvalidPassword123',
      });
      expect(result.success).toBe(false);
      expect(result.error?.errors[0].message).toContain('Password must contain at least one special character');
    });
  });
});
