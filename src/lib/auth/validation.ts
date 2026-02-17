import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters long' });

export const signupSchema = z
  .object({
    username: z
      .string()
      .min(3, { message: 'Username must be at least 3 characters long' })
      .max(50, { message: 'Username cannot exceed 50 characters' }),
    email: z.string().email({ message: 'Invalid email address' }),
    password: passwordSchema,
    confirmPassword: z.string(),
    role: z.enum(['player', 'dm'], { required_error: 'Please select a role' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// Backward-compatible alias used by existing UI/tests.
export const registrationSchema = signupSchema;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const formatLoginRequest = (data: z.infer<typeof loginSchema>) => ({
  email: data.email.trim().toLowerCase(),
  password: data.password,
});
