import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../shared/Button';
import { Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { passwordChangeSchema } from '../../lib/auth/validation'; 

export function PasswordChangeForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { updateUserPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setValidationErrors({}); 

    // --- Client-side Validation ---
    const validationResult = passwordChangeSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        const pathKey = err.path[0] as string | undefined;
        if (pathKey) {
          fieldErrors[pathKey] = err.message;
        } else {
          setError(err.message); 
        }
      });
      setValidationErrors(fieldErrors);
      if (!error && Object.keys(fieldErrors).length > 0) {
         setError('Please fix the errors in the form.');
      }
      return;
    }

    setLoading(true);
    try {
      const { currentPassword: validatedCurrent, newPassword: validatedNew } = validationResult.data;
      await updateUserPassword(validatedCurrent, validatedNew);
      setSuccess('Password updated successfully!');
      
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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
      
      {/* Feedback Banners */}
      {success && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-600" />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Current Password */}
      <div>
        <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Current Password
        </label>
        <div className="relative">
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
            className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 transition-colors ${
              validationErrors.currentPassword 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            }`}
            placeholder="••••••••"
          />
        </div>
         {validationErrors.currentPassword && (
           <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
             <AlertCircle size={12} /> {validationErrors.currentPassword}
           </p>
         )}
      </div>

      {/* New Password */}
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          New Password
        </label>
        <div className="relative">
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
            className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 transition-colors ${
              validationErrors.newPassword 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            }`}
            placeholder="••••••••"
          />
        </div>
         {validationErrors.newPassword && (
           <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
             <AlertCircle size={12} /> {validationErrors.newPassword}
           </p>
         )}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1.5">
          Confirm New Password
        </label>
        <div className="relative">
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
            className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 transition-colors ${
              validationErrors.confirmPassword 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
            }`}
            placeholder="••••••••"
          />
        </div>
         {validationErrors.confirmPassword && (
           <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
             <AlertCircle size={12} /> {validationErrors.confirmPassword}
           </p>
         )}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          variant="primary"
          loading={loading}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          Update Password
        </Button>
      </div>
    </form>
  );
}