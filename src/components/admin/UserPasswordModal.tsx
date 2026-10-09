import { useState } from 'react';
import { AlertTriangle, Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';
import { AccessibleDialog } from '../shared/AccessibleDialog';
import { Button } from '../shared/Button';
import { resetUserPassword, type AdminUser } from '../../lib/api/adminUsers';
import { getAbsoluteAppUrl } from '../../lib/appUrl';

interface UserPasswordModalProps {
  user: AdminUser;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function UserPasswordModal({ user, onClose, onDone }: UserPasswordModalProps) {
  const [mode, setMode] = useState<'generate' | 'custom'>('generate');
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ password: string; sessionsRevoked: number } | null>(null);
  const [copied, setCopied] = useState<'password' | 'details' | null>(null);

  const customInvalid = mode === 'custom' && custom.length < 8;
  const signInUrl = getAbsoluteAppUrl('login');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (customInvalid) return;
    setWorking(true);
    setError(null);
    try {
      const response = await resetUserPassword(user.id, mode === 'custom' ? custom : undefined);
      setResult({ password: response.password, sessionsRevoked: response.sessionsRevoked });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset the password.');
    } finally {
      setWorking(false);
    }
  };

  const copy = async (kind: 'password' | 'details', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Copying is blocked by the browser. Select the password and copy it manually.');
    }
  };

  const finish = () => {
    onDone(`Password reset for ${user.username || user.email}.`);
  };

  if (result) {
    const details = `Sign in: ${signInUrl}\nEmail: ${user.email}\nTemporary password: ${result.password}`;
    return (
      <AccessibleDialog
      bodyClassName="px-4 py-4 sm:px-6"
        onClose={finish}
        title="Password reset"
        description={user.email}
        closeOnBackdrop={false}
        footer={<div className="flex w-full justify-end"><Button onClick={finish}>Done</Button></div>}
      >
        <div className="space-y-4">
          <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
            The new password is active. {result.sessionsRevoked > 0
              ? `${result.sessionsRevoked} existing session${result.sessionsRevoked === 1 ? ' was' : 's were'} signed out.`
              : 'They had no active sessions.'}
          </p>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Temporary password</p>
            <div className="flex items-center gap-2">
              <code data-testid="temporary-password" className="flex-1 select-all break-all rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm">{result.password}</code>
              <Button type="button" variant="outline" size="icon" aria-label="Copy password" onClick={() => copy('password', result.password)}>
                {copied === 'password' ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button type="button" variant="outline" fullWidth icon={copied === 'details' ? Check : Copy} onClick={() => copy('details', details)}>
            {copied === 'details' ? 'Copied' : 'Copy sign-in details'}
          </Button>
          <p className="flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            This is the only time the password is shown, and no email is sent. Share it through a private channel and ask the user to change it after signing in.
          </p>
        </div>
      </AccessibleDialog>
    );
  }

  return (
    <AccessibleDialog
      bodyClassName="px-4 py-4 sm:px-6"
      onClose={onClose}
      title="Reset password"
      description={user.email}
      closeDisabled={working}
      footer={(
        <div className="flex w-full justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={working}>Cancel</Button>
          <Button type="submit" form="reset-password-form" icon={KeyRound} loading={working} disabled={customInvalid}>Reset password</Button>
        </div>
      )}
    >
      <form id="reset-password-form" onSubmit={submit} className="space-y-4">
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {!user.has_password && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This account has no password yet, so it cannot sign in. Setting one fixes that.</p>
        )}
        <fieldset className="space-y-3">
          <legend className="sr-only">How to choose the password</legend>
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="mode" className="mt-1" checked={mode === 'generate'} onChange={() => setMode('generate')} />
            <span><span className="font-medium text-gray-900">Generate a strong password</span><br /><span className="text-gray-500">Recommended. You will see it once.</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="mode" className="mt-1" checked={mode === 'custom'} onChange={() => setMode('custom')} />
            <span className="flex-1"><span className="font-medium text-gray-900">Choose a password</span>
              {mode === 'custom' && (
                <span className="mt-2 flex items-center gap-2">
                  <input
                    type={showCustom ? 'text' : 'password'}
                    aria-label="New password"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label={showCustom ? 'Hide password' : 'Show password'} onClick={() => setShowCustom(!showCustom)}>
                    {showCustom ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </span>
              )}
              {mode === 'custom' && custom.length > 0 && custom.length < 8 && <span className="mt-1 block text-xs text-red-600">At least 8 characters.</span>}
            </span>
          </label>
        </fieldset>
        <p className="text-xs text-gray-500">Changing the password signs the user out of every device straight away.</p>
      </form>
    </AccessibleDialog>
  );
}
