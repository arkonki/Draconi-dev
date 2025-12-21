import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { User as AuthUser } from '@supabase/supabase-js';
import { User as UserIcon, Mail, Save, AlertCircle, CheckCircle, Link as LinkIcon, Loader2 } from 'lucide-react';
import { Button } from '../shared/Button';
import { PasswordChangeForm } from './PasswordChangeForm';
import { getUserProfile, updateUserProfile, updateUserAuthEmail, UserProfile, UserProfileUpdate } from '../../lib/api/users';
import { LoadingSpinner } from '../shared/LoadingSpinner';

export function ProfileSettings() {
  const { user: authUser, session } = useAuth();
  
  // --- STATE ---
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // Form State
  const [formData, setFormData] = useState<UserProfileUpdate>({
    first_name: '',
    last_name: '',
    username: '',
    avatar_url: '',
    bio: ''
  });
  
  const [emailForm, setEmailForm] = useState('');
  const [initialEmail, setInitialEmail] = useState('');

  // UI State
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // --- DATA FETCHING ---
  const fetchProfile = useCallback(async (currentUser: AuthUser) => {
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);
    setImageError(false);
    
    try {
      const userProfile = await getUserProfile(currentUser.id);
      const currentEmail = currentUser.email ?? '';

      if (userProfile) {
        setProfile(userProfile);
        setFormData({
          first_name: userProfile.first_name ?? '',
          last_name: userProfile.last_name ?? '',
          username: userProfile.username ?? currentUser.user_metadata?.username ?? '',
          avatar_url: userProfile.avatar_url ?? '',
          bio: userProfile.bio ?? '',
        });
      } else {
         // Fallback for new users without profile rows
         setFormData({
             first_name: '',
             last_name: '',
             username: currentUser.user_metadata?.username ?? '',
             avatar_url: '',
             bio: ''
         });
      }
      
      setEmailForm(currentEmail);
      setInitialEmail(currentEmail);

    } catch (err) {
      console.error("Failed to load profile:", err);
      setError("Failed to load profile data. Please refresh.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) {
      fetchProfile(authUser);
    } else {
      setIsLoading(false);
    }
  }, [authUser, fetchProfile]);

  // --- HANDLERS ---

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'avatar_url') setImageError(false); // Reset image error when URL changes
    setError(null);
    setSuccessMessage(null);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setEmailForm(e.target.value);
      setError(null);
      setSuccessMessage(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;

    setIsUpdating(true);
    setError(null);
    setSuccessMessage(null);

    let changesMade = false;
    let emailUpdateMessage = '';

    try {
      // 1. Update Profile (Public Table)
      const profileUpdates: UserProfileUpdate = {};
      const baseline = profile ?? { username: '', first_name: '', last_name: '', avatar_url: '', bio: '' };

      // Diff check to only send changed fields
      if (formData.first_name !== (baseline.first_name ?? '')) profileUpdates.first_name = formData.first_name;
      if (formData.last_name !== (baseline.last_name ?? '')) profileUpdates.last_name = formData.last_name;
      if (formData.username !== (baseline.username ?? '')) profileUpdates.username = formData.username;
      if (formData.avatar_url !== (baseline.avatar_url ?? '')) profileUpdates.avatar_url = formData.avatar_url;
      if (formData.bio !== (baseline.bio ?? '')) profileUpdates.bio = formData.bio;

      if (Object.keys(profileUpdates).length > 0) {
          changesMade = true;
          const updatedProfile = await updateUserProfile(authUser.id, profileUpdates);
          setProfile(prev => prev ? { ...prev, ...updatedProfile } : updatedProfile);
      }

      // 2. Update Email (Auth Table)
      const trimmedEmail = emailForm.trim();
      if (trimmedEmail !== initialEmail) {
        if (!trimmedEmail) throw new Error("Email cannot be empty.");
        
        changesMade = true;
        await updateUserAuthEmail(trimmedEmail);
        emailUpdateMessage = " Check your new email for a verification link.";
      }

      if (changesMade) {
           setSuccessMessage(`Profile updated successfully.${emailUpdateMessage}`);
      } else {
           setSuccessMessage("No changes were made.");
      }

    } catch (err) {
      console.error("Profile update failed:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) return <div className="flex justify-center items-center py-12"><LoadingSpinner /></div>;
  if (!authUser) return <p className="text-center text-red-600 py-8">Please log in to edit your profile.</p>;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div>
        <h2 className="text-xl md:text-2xl font-bold mb-6 text-gray-900 border-b pb-4">Profile Settings</h2>

        {/* --- AVATAR SECTION --- */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200">
          
          {/* Avatar Preview */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white shadow-sm flex items-center justify-center overflow-hidden border-4 border-white ring-1 ring-gray-200">
               {!imageError && formData.avatar_url ? (
                 <img
                   src={formData.avatar_url}
                   alt="Profile"
                   className="w-full h-full object-cover"
                   onError={() => setImageError(true)}
                 />
               ) : (
                 <UserIcon className="w-12 h-12 text-gray-300" />
               )}
            </div>
            {/* Status indicator (optional) */}
            <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full" title="Online"></div>
          </div>

          {/* Avatar Inputs */}
          <div className="flex-grow w-full text-center sm:text-left space-y-3">
            <div>
              <h3 className="font-bold text-lg text-gray-900">{formData.username || 'Adventurer'}</h3>
              <p className="text-sm text-gray-500">{emailForm}</p>
            </div>
            
            <div className="space-y-1">
                 <label htmlFor="avatar_url" className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1">
                    <LinkIcon size={12} /> Avatar Image URL
                 </label>
                 <input
                     id="avatar_url"
                     name="avatar_url"
                     type="url"
                     value={formData.avatar_url ?? ''}
                     onChange={handleInputChange}
                     placeholder="https://imgur.com/..."
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                 />
                 <p className="text-[10px] text-gray-400">Paste a direct link to an image (JPG, PNG).</p>
            </div>
          </div>
        </div>

        {/* --- MAIN FORM --- */}
        <form onSubmit={handleSubmit} className="space-y-6">
           
           {/* Feedback Banners */}
           {successMessage && (
             <div className="p-4 rounded-lg bg-green-50 border border-green-200 text-green-800 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
               <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-green-600" />
               <p className="text-sm font-medium">{successMessage}</p>
             </div>
           )}

           {error && (
             <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
               <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-600" />
               <p className="text-sm font-medium">{error}</p>
             </div>
           )}

          {/* Names Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1.5">First Name</label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                value={formData.first_name ?? ''}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Gandalf"
              />
            </div>
            <div>
              <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1.5">Last Name</label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                value={formData.last_name ?? ''}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="The Grey"
              />
            </div>
          </div>

          {/* Account Details */}
          <div className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
                <Mail size={16} /> Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={emailForm}
                onChange={handleEmailChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              {emailForm !== initialEmail && (
                 <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                    <AlertCircle size={12} /> Changing email requires verification.
                 </p>
              )}
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1.5">Username (Public)</label>
              <input
                id="username"
                name="username"
                type="text"
                value={formData.username ?? ''}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1.5">Bio</label>
              <textarea
                id="bio"
                name="bio"
                value={formData.bio ?? ''}
                onChange={handleInputChange}
                rows={4}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                placeholder="Tell us about your adventures..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex flex-col sm:flex-row sm:justify-end gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={isUpdating || isLoading}
              className="w-full sm:w-auto flex justify-center items-center gap-2 px-6 py-2.5"
            >
              {isUpdating ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
              {isUpdating ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>

      {/* Password Change Section */}
      <div className="border-t border-gray-200 pt-10 mt-10">
        <h3 className="text-xl font-bold text-gray-900 mb-6">Security</h3>
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
           <PasswordChangeForm />
        </div>
      </div>
    </div>
  );
}
