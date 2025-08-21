import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { User, Key, Copy, Check, AlertCircle, X } from 'lucide-react';
import { Button } from '../shared/Button';

interface UserCreationModalProps {
  onClose: () => void;
  onUserCreated: () => void;
}

// Expanded interface to include full table structure fields
interface CreatedUser {
  id: string;
  email: string;
  username: string;
  created_at: string;
  role: 'player' | 'dm' | string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  bio?: string;
  is_active?: boolean;
  is_email_verified?: boolean;
  updated_at?: string;
  email_change?: string;
  last_login?: string;
  account_status?: string;
  two_factor_enabled?: boolean;
  two_factor_secret?: string;
  failed_login_attempts?: number;
  last_failed_login?: string;
  password_changed_at?: string;
  password_hash?: string;
}

export function UserCreationModal({ onClose, onUserCreated }: UserCreationModalProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'player' | 'dm'>('player');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [signInLink, setSignInLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // States for loading created users
  const [users, setUsers] = useState<CreatedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Fetch users from the public.users table
  const fetchUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    const { data, error } = await supabase.from('users').select('*');
    if (error) {
      setUsersError(error.message);
    } else {
      setUsers(data as CreatedUser[]);
    }
    setUsersLoading(false);
  };

  // Load the users when the component mounts
  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Generate a random temporary password
      const tempPassword = Math.random().toString(36).slice(-12);

      // Create the auth user using Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: { data: { username } }
      });
      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      // Update the user's role in the public.users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ role })
        .eq('id', authData.user.id);
      if (updateError) throw updateError;

      // Generate the sign-in link
      const signInUrl = new URL(window.location.origin);
      signInUrl.searchParams.set('email', email);
      signInUrl.searchParams.set('password', tempPassword);
      setSignInLink(signInUrl.toString());

      setSuccess(true);
      onUserCreated();

      // Refresh the user list after creating a user
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (signInLink) {
      try {
        await navigator.clipboard.writeText(signInLink);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch (err) {
        setError('Failed to copy link to clipboard');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Create New User</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-6 h-6" />
            </button>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && signInLink ? (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="font-medium text-green-800 mb-2">User Created Successfully!</h3>
                <p className="text-sm text-green-700">
                  Share the following link with the user to let them sign in:
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={signInLink}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
                />
                <Button variant="secondary" icon={linkCopied ? Check : Copy} onClick={copyToClipboard}>
                  {linkCopied ? 'Copied!' : 'Copy'}
                </Button>
              </div>

              <div className="flex justify-end">
                <Button variant="primary" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'player' | 'dm')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="player">Player</option>
                  <option value="dm">Dungeon Master</option>
                </select>
              </div>

              <div className="flex justify-end gap-4">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" icon={User} loading={loading}>
                  Create User
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Section to display the list of created users */}
        <div className="p-6 border-t">
          <h3 className="text-lg font-bold mb-4">Created Users</h3>
          {usersLoading ? (
            <p>Loading users...</p>
          ) : usersError ? (
            <p className="text-red-600">Error loading users: {usersError}</p>
          ) : users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td className="px-4 py-2 whitespace-nowrap">{user.username}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.email}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.role}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{new Date(user.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{user.account_status || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No users found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
