import { useState } from 'react';
import { AlertCircle, Check, Copy, Eye, EyeOff, RefreshCw, User, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getAbsoluteAppUrl } from '../../lib/appUrl';
import { Button } from '../shared/Button';

interface UserCreationModalProps {
  onClose: () => void;
  onUserCreated: () => void;
}

interface CreatedCredentials {
  email: string;
  username: string;
  role: 'player' | 'dm';
  temporaryPassword: string;
}

type CopiedField = 'email' | 'password' | 'credentials' | null;

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

export function generateTemporaryPassword(length = 18) {
  const randomValues = new Uint32Array(length);
  window.crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]).join('');
}

export function UserCreationModal({ onClose, onUserCreated }: UserCreationModalProps) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'player' | 'dm'>('player');
  const [temporaryPassword, setTemporaryPassword] = useState(() => generateTemporaryPassword());
  const [showPassword, setShowPassword] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<CreatedCredentials | null>(null);
  const [copiedField, setCopiedField] = useState<CopiedField>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signInUrl = getAbsoluteAppUrl('login');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim();

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: temporaryPassword,
        options: { data: { username: normalizedUsername, role } },
      });
      if (authError) throw authError;
      if (!data.user) throw new Error('The server did not return the created user');

      setCreatedCredentials({
        email: normalizedEmail,
        username: normalizedUsername,
        role,
        temporaryPassword,
      });
      onUserCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (value: string, field: Exclude<CopiedField, null>) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setError('Failed to copy to the clipboard');
    }
  };

  const resetForm = () => {
    setEmail('');
    setUsername('');
    setRole('player');
    setTemporaryPassword(generateTemporaryPassword());
    setShowPassword(false);
    setCreatedCredentials(null);
    setCopiedField(null);
    setError(null);
  };

  const credentialSummary = createdCredentials
    ? `Draconi sign in: ${signInUrl}\nEmail: ${createdCredentials.email}\nTemporary password: ${createdCredentials.temporaryPassword}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 id="create-user-title" className="text-xl font-bold text-gray-900">
              {createdCredentials ? 'User created' : 'Create new user'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {createdCredentials
                ? 'Copy these credentials now; the password cannot be displayed again.'
                : 'Create a restricted local account without enabling public registration.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {createdCredentials ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-green-800">
                  <Check className="h-5 w-5" />
                  {createdCredentials.username} is ready to sign in
                </div>
                <p className="mt-1 text-sm text-green-700">
                  Role: {createdCredentials.role === 'dm' ? 'Dungeon Master' : 'Player'}
                </p>
              </div>

              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <CredentialRow
                  label="Email"
                  value={createdCredentials.email}
                  copied={copiedField === 'email'}
                  onCopy={() => copyText(createdCredentials.email, 'email')}
                />
                <CredentialRow
                  label="Temporary password"
                  value={createdCredentials.temporaryPassword}
                  copied={copiedField === 'password'}
                  onCopy={() => copyText(createdCredentials.temporaryPassword, 'password')}
                />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Sign-in address</p>
                  <p className="mt-1 break-all text-sm text-gray-700">{signInUrl}</p>
                </div>
              </div>

              <p className="text-sm text-amber-700">
                Send the credentials through a trusted channel and ask the user to change the temporary password after signing in.
              </p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Create another
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onClose}>Done</Button>
                  <Button
                    type="button"
                    icon={copiedField === 'credentials' ? Check : Copy}
                    onClick={() => copyText(credentialSummary, 'credentials')}
                  >
                    {copiedField === 'credentials' ? 'Copied' : 'Copy credentials'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="new-user-email" className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  id="new-user-email"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="new-user-username" className="mb-1 block text-sm font-medium text-gray-700">Username</label>
                <input
                  id="new-user-username"
                  type="text"
                  required
                  minLength={3}
                  maxLength={50}
                  autoComplete="off"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="new-user-role" className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select
                  id="new-user-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as 'player' | 'dm')}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                >
                  <option value="player">Player</option>
                  <option value="dm">Dungeon Master</option>
                </select>
              </div>

              <div>
                <label htmlFor="new-user-password" className="mb-1 block text-sm font-medium text-gray-700">Temporary password</label>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      id="new-user-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={temporaryPassword}
                      onChange={(event) => setTemporaryPassword(event.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 font-mono focus:border-transparent focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Generate another password"
                    aria-label="Generate another password"
                    onClick={() => setTemporaryPassword(generateTemporaryPassword())}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Generated locally and stored only as a secure hash.</p>
              </div>

              <div className="flex justify-end gap-3 border-t pt-5">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button type="submit" icon={User} loading={loading}>Create user</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function CredentialRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1.5 text-sm text-gray-900">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCopy}
          title={`Copy ${label.toLowerCase()}`}
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
