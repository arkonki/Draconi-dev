import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User as AuthUser } from '@supabase/supabase-js'; // Alias Supabase User
import { User as UserIcon, Mail, Camera, Save, AlertCircle, CheckCircle } from 'lucide-react'; // Rename icon import
import { Button } from '../shared/Button';
import { PasswordChangeForm } from './PasswordChangeForm';
import { getUserProfile, updateUserProfile, updateUserAuthEmail, UserProfile, UserProfileUpdate } from '../../lib/api/users'; // Import new functions and types
import { LoadingSpinner } from '../shared/LoadingSpinner'; // Assuming you have this component

export function ProfileSettings() {
  const { user: authUser, session } = useAuth(); // Use aliased authUser
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState<UserProfileUpdate>({
    first_name: '',
    last_name: '',
    username: '',
    avatar_url: '',
    bio: ''
  });
  const [emailForm, setEmailForm] = useState(''); // Separate state for email input
  const [initialEmail, setInitialEmail] = useState(''); // Store initial *verified* email to detect changes

  const [isLoading, setIsLoading] = useState(true); // Loading profile data
  const [isUpdating, setIsUpdating] = useState(false); // Updating profile
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch profile data
  const fetchProfile = useCallback(async (currentUser: AuthUser) => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null); // Clear messages on fetch
    try {
      const userProfile = await getUserProfile(currentUser.id);
      const currentEmail = currentUser.email ?? ''; // Get email from authUser

      if (userProfile) {
        setProfile(userProfile);
        // Populate form with fetched data, handling null values
        setFormData({
          first_name: userProfile.first_name ?? '',
          last_name: userProfile.last_name ?? '',
          // Use profile username if available, otherwise fallback to metadata, then empty
          username: userProfile.username ?? currentUser.user_metadata?.username ?? '',
          avatar_url: userProfile.avatar_url ?? '',
          bio: userProfile.bio ?? '',
        });
      } else {
         // Handle case where profile doesn't exist yet
         console.warn("User profile not found in 'users' table, initializing form with defaults/metadata.");
         setFormData({
             first_name: '',
             last_name: '',
             username: currentUser.user_metadata?.username ?? '', // Fallback to metadata username
             avatar_url: '',
             bio: ''
         });
      }
      // Set email states based on the verified authUser email
      setEmailForm(currentEmail);
      setInitialEmail(currentEmail);

    } catch (err) {
      console.error("Failed to load profile:", err);
      setError(err instanceof Error ? err.message : "Failed to load profile data.");
      // Initialize form with auth data as fallback in case of error
      const currentEmail = authUser?.email ?? '';
      setEmailForm(currentEmail);
      setInitialEmail(currentEmail);
      setFormData({
          first_name: '',
          last_name: '',
          username: authUser?.user_metadata?.username ?? '',
          avatar_url: '',
          bio: ''
      });
    } finally {
      setIsLoading(false);
    }
  }, []); // Removed authUser dependency, pass it directly

  useEffect(() => {
    if (authUser) {
      fetchProfile(authUser);
    } else {
      // Handle case where authUser is null (e.g., logged out)
      setIsLoading(false);
      setProfile(null);
      setFormData({ first_name: '', last_name: '', username: '', avatar_url: '', bio: '' });
      setEmailForm('');
      setInitialEmail('');
      setError(null);
      setSuccessMessage(null);
    }
  }, [authUser, fetchProfile]); // Fetch when authUser changes

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null); // Clear error on input change
    setSuccessMessage(null);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmailForm(e.target.value);
      setError(null);
      setSuccessMessage(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) {
      setError("You must be logged in to update your profile.");
      return;
    }

    setIsUpdating(true);
    setError(null);
    setSuccessMessage(null);

    let profileUpdateSuccess = false;
    let emailUpdateInitiated = false;
    let emailUpdateMessage = '';
    let changesMade = false;

    try {
      // 1. Update non-email profile fields in public.users
      const profileUpdates: UserProfileUpdate = {};
      // Determine the baseline for comparison (fetched profile or initial defaults if profile was null)
      const baselineProfileData = profile ?? {
          username: authUser.user_metadata?.username ?? '',
          first_name: null,
          last_name: null,
          avatar_url: null,
          bio: null
      };

      // Compare current form data against the baseline
      if (formData.first_name !== (baselineProfileData.first_name ?? '')) profileUpdates.first_name = formData.first_name;
      if (formData.last_name !== (baselineProfileData.last_name ?? '')) profileUpdates.last_name = formData.last_name;
      if (formData.username !== (baselineProfileData.username ?? '')) profileUpdates.username = formData.username;
      if (formData.avatar_url !== (baselineProfileData.avatar_url ?? '')) profileUpdates.avatar_url = formData.avatar_url;
      if (formData.bio !== (baselineProfileData.bio ?? '')) profileUpdates.bio = formData.bio;


      if (Object.keys(profileUpdates).length > 0) {
          changesMade = true;
          const updatedProfile = await updateUserProfile(authUser.id, profileUpdates);
          // Update local state based on response
          setProfile(prev => prev ? { ...prev, ...updatedProfile } : updatedProfile);
          // Update form data to reflect saved state (important if API modifies data, e.g., trimming)
           setFormData({
              first_name: updatedProfile.first_name ?? '',
              last_name: updatedProfile.last_name ?? '',
              username: updatedProfile.username ?? '',
              avatar_url: updatedProfile.avatar_url ?? '',
              bio: updatedProfile.bio ?? '',
           });
          profileUpdateSuccess = true;
      } else {
          // No profile fields changed, still consider it a success for this part
          profileUpdateSuccess = true; // Allows proceeding to email check
      }


      // 2. Handle email change (auth.users) if necessary
      const trimmedEmailForm = emailForm.trim();
      if (trimmedEmailForm !== initialEmail) {
        if (!trimmedEmailForm) {
            throw new Error("Email cannot be empty.");
        }
        changesMade = true;
        await updateUserAuthEmail(trimmedEmailForm);
        emailUpdateInitiated = true;
        // IMPORTANT: Do NOT update initialEmail here. It remains the last *verified* email.
        // The emailForm state holds the new, unverified email.
        // Supabase handles the verification flow.
        emailUpdateMessage = " Email update initiated. Please check both your current and new email addresses for a verification link to complete the change.";
      }

      // Set success message based on what happened
       if (changesMade) {
           let message = '';
           if (profileUpdateSuccess && Object.keys(profileUpdates).length > 0) message += 'Profile fields updated successfully.';
           message += emailUpdateMessage; // Append email message if relevant
           setSuccessMessage(message.trim());
       } else {
           setSuccessMessage("No changes were detected.");
       }


    } catch (err) {
      console.error("Failed to update profile:", err);
      const message = err instanceof Error ? err.message : "An unknown error occurred during update.";
      setError(message);
      // Do not revert form data on error, let the user correct it.
    } finally {
      setIsUpdating(false);
    }
  };

  // Simple image error handler for the avatar
  const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const img = e.currentTarget;
      img.style.display = 'none'; // Hide the broken image element
      // Find the sibling fallback icon and display it
      const fallback = img.parentElement?.querySelector('.fallback-icon');
      if (fallback) (fallback as HTMLElement).style.display = 'flex';
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>;
  }

  // Display message if user is not logged in or session expired
  if (!authUser || !session) {
      return <p className="text-center text-red-600">Please log in to view or edit your profile.</p>;
  }


  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-6">Profile Settings</h2>

        {/* Avatar Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
          {/* Avatar Display */}
          <div className="relative w-24 h-24">
            <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border">
               {/* Image - Hidden by default until loaded or if no URL */}
               {formData.avatar_url && (
                 <img
                   key={formData.avatar_url} // Re-render if URL changes
                   src={formData.avatar_url}
                   alt="Profile"
                   className="w-full h-full object-cover"
                   onError={handleAvatarError}
                   style={{ display: 'block' }} // Initially block, error handler hides it
                 />
               )}
               {/* Fallback Icon - Shown if no URL or if image errors */}
               <div className="absolute inset-0 flex items-center justify-center fallback-icon"
                    style={{ display: !formData.avatar_url ? 'flex' : 'none' }}>
                   <UserIcon className="w-12 h-12 text-gray-400" />
               </div>
            </div>
          </div>

          {/* User Info & Avatar URL Input */}
          <div className="flex-grow w-full sm:w-auto">
            {/* Display username from form state, fallback to auth user */}
            <h3 className="font-medium text-lg text-center sm:text-left">{formData.username || authUser?.user_metadata?.username || 'User'}</h3>
            {/* Display email from form state (the potentially unverified one) */}
            <p className="text-sm text-gray-600 flex items-center justify-center sm:justify-start gap-1">
                <Mail className="w-4 h-4" />
                {emailForm || 'No email set'}
            </p>
             {/* Avatar URL Input */}
             <div className="mt-2">
                 <label htmlFor="avatar_url" className="block text-xs font-medium text-gray-600 mb-1">Avatar URL</label>
                 <input
                     id="avatar_url"
                     name="avatar_url"
                     type="url"
                     value={formData.avatar_url ?? ''}
                     onChange={handleInputChange}
                     placeholder="https://example.com/avatar.png"
                     className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                 />
             </div>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
           {/* Success Message */}
           {successMessage && (
             <div className="p-4 mb-4 text-sm text-green-700 bg-green-100 rounded-lg flex items-start gap-2" role="alert">
               <CheckCircle className="w-5 h-5 mt-px flex-shrink-0" />
               <div><span className="font-medium">Success!</span> {successMessage}</div>
             </div>
           )}

           {/* Error Message */}
           {error && (
             <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg flex items-start gap-2" role="alert">
               <AlertCircle className="w-5 h-5 mt-px flex-shrink-0" />
               <div><span className="font-medium">Error!</span> {error}</div>
             </div>
           )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                value={formData.first_name ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                value={formData.last_name ?? ''}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Email - Requires special handling */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={emailForm}
              onChange={handleEmailChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              aria-describedby="email-description"
              // disabled={isUpdating} // Disable during update
            />
             <p id="email-description" className="text-xs text-gray-500 mt-1">
                Changing your email requires verification via links sent to both addresses.
             </p>
          </div>

          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={formData.username ?? ''}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              // disabled={isUpdating} // Disable during update
            />
             <p className="text-xs text-gray-500 mt-1">
                Must be unique. Used for display and potentially logging in.
             </p>
          </div>

          {/* Bio */}
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
              Bio
            </label>
            <textarea
              id="bio"
              name="bio"
              value={formData.bio ?? ''}
              onChange={handleInputChange}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              placeholder="Tell us a little about yourself..."
              // disabled={isUpdating} // Disable during update
            />
          </div>

          <div className="flex justify-end pt-4">
            <Button
              type="submit"
              variant="primary"
              icon={Save}
              loading={isUpdating}
              disabled={isUpdating || isLoading} // Disable while loading profile or updating
            >
              Save Changes
            </Button>
          </div>
        </form>
      </div>

      {/* Password Change Section */}
      <div className="border-t pt-8 mt-12">
        <h3 className="text-lg font-semibold mb-6">Change Password</h3>
        <PasswordChangeForm />
      </div>
    </div>
  );
}
