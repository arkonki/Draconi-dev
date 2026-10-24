import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { accountApi } from '../lib/supabase';
import { passwordSchema } from '../lib/auth/validation';
import { Button } from '../components/shared/Button';
import { AuthNotice, AuthShell, authInputClass } from '../components/auth/AuthShell';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Keep the token in memory only: take it from the address bar, then remove it from the URL and history.
  const [token] = useState(() => searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) window.history.replaceState(null, '', window.location.pathname);
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Choose a stronger password.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await accountApi.resetPassword(token, password);
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    navigate('/login', { replace: true, state: { message: 'Your password has been changed. Sign in with the new one.' } });
  };

  if (!token) {
    return (
      <AuthShell title="Reset password">
        <AuthNotice tone="error">This link is incomplete. Open the link from the email again, or request a new one.</AuthNotice>
        <p className="text-center text-sm text-gray-600"><Link to="/forgot-password" className="font-medium text-blue-600 hover:underline">Request a new link</Link></p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You will be signed out everywhere else">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {error && (
          <AuthNotice tone="error">
            {error} {error.includes('expired') && <Link to="/forgot-password" className="font-medium underline">Request a new link</Link>}
          </AuthNotice>
        )}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">New password</label>
          <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={`mt-1 ${authInputClass}`} disabled={loading} />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">Repeat new password</label>
          <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} className={`mt-1 ${authInputClass}`} disabled={loading} />
        </div>
        <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>Change password</Button>
      </form>
    </AuthShell>
  );
}
