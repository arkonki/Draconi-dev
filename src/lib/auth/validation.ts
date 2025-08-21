import { z } from 'zod';

// --- Login Schema ---
export const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(1, { message: "Password is required" }), // Basic check, Supabase handles complexity
});

// --- Signup Schema ---
export const signupSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters long" }).max(50, { message: "Username cannot exceed 50 characters" }),
  email: z.string().email({ message: "Invalid email address" }),
  password: z.string().min(8, { message: "Password must be at least 8 characters long" })
    // Add more complexity rules if desired, e.g., regex for uppercase, number, symbol
    // .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    //   message: "Password must contain uppercase, lowercase, number, and special character",
    // })
    ,
  confirmPassword: z.string(),
  role: z.enum(['player', 'dm'], { required_error: "Please select a role" }), // Role selection
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"], // Error applies to the confirmPassword field
});


// --- Password Change Schema ---
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match",
  path: ["confirmNewPassword"],
});


// Helper function (optional, could be inline)
export const formatLoginRequest = (data: z.infer<typeof loginSchema>) => {
  return {
    email: data.email.trim().toLowerCase(),
    password: data.password, // Keep password as is
  };
};
