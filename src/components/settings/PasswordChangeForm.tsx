import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../shared/Button';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { passwordChangeSchema } from '../../lib/auth/validation'; // Import the schema
import { z } from 'zod'; // Import z

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({}); // For field-specific errors

  const { updateUserPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setValidationErrors({}); // Clear previous validation errors

    // --- Client-side Validation ---
    const validationResult = passwordChangeSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        // Use the first path element as the key
        const pathKey = err.path[0] as string | undefined;
        if (pathKey) {
          fieldErrors[pathKey] = err.message;
        } else {
          // Handle top-level errors (like the refine check)
          setError(err.message); // Show refine error as general error
        }
      });
      setValidationErrors(fieldErrors);
      if (!error && Object.keys(fieldErrors).length > 0) {
         setError('Please fix the errors in the form.'); // General message if only field errors
      }
      return;
    }
    // --- End Validation ---

    setLoading(true);
    try {
      const { currentPassword: validatedCurrent, newPassword: validatedNew } = validationResult.data;
      await updateUserPassword(validatedCurrent, validatedNew);
      setSuccess('Password updated successfully!');
      // Clear fields after successful update
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Password update error:', err);
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h3 className="text-lg font-medium leading-6 text-gray-900">Change Password</h3>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircle className="h-5 w-5 text-green-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{success}</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="current-password"
          className="block text-sm font-medium text-gray-700"
        >
          Current Password
        </label>
        <div className="mt-1 relative">
           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <Lock className="h-5 w-5 text-gray-400" />
           </div>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={`pl-10 block w-full shadow-sm sm:text-sm border rounded-md px-3 py-2 ${
              validationErrors.currentPassword ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          />
        </div>
         {validationErrors.currentPassword && (
           <p className="mt-1 text-xs text-red-600">{validationErrors.currentPassword}</p>
         )}
      </div>

      <div>
        <label
          htmlFor="new-password"
          className="block text-sm font-medium text-gray-700"
        >
          New Password
        </label>
        <div className="mt-1 relative">
           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <Lock className="h-5 w-5 text-gray-400" />
           </div>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={`pl-10 block w-full shadow-sm sm:text-sm border rounded-md px-3 py-2 ${
              validationErrors.newPassword ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          />
        </div>
         {validationErrors.newPassword && (
           <p className="mt-1 text-xs text-red-600">{validationErrors.newPassword}</p>
         )}
      </div>

      <div>
        <label
          htmlFor="confirm-password"
          className="block text-sm font-medium text-gray-700"
        >
          Confirm New Password
        </label>
        <div className="mt-1 relative">
           <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
             <Lock className="h-5 w-5 text-gray-400" />
           </div>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`pl-10 block w-full shadow-sm sm:text-sm border rounded-md px-3 py-2 ${
              validationErrors.confirmPassword ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
            }`}
          />
        </div>
         {validationErrors.confirmPassword && (
           <p className="mt-1 text-xs text-red-600">{validationErrors.confirmPassword}</p>
         )}
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          loading={loading}
          disabled={loading}
        >
          Update Password
        </Button>
      </div>
    </form>
  );
}
