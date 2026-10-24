import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { accountApi } from '../lib/supabase';
import { Button } from '../components/shared/Button';
import { AuthNotice, AuthShell, authInputClass } from '../components/auth/AuthShell';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    const { error: requestError } = await accountApi.requestPasswordReset(email.trim());
    setLoading(false);
    if (requestError) setError(requestError.message);
    else setSent(true);
  };

  return (
    <AuthShell title="Forgot password" subtitle="We will email you a link to choose a new one">
      {sent ? (
        <AuthNotice tone="success">
          If an account exists for that address, a reset link is on its way. It works once and expires in an hour. Check your spam folder if it does not arrive.
        </AuthNotice>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          {error && <AuthNotice tone="error">{error}</AuthNotice>}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={`mt-1 ${authInputClass}`} disabled={loading} />
          </div>
          <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>Send reset link</Button>
        </form>
      )}
      <p className="text-center text-sm text-gray-600"><Link to="/login" className="font-medium text-blue-600 hover:underline">Back to sign in</Link></p>
    </AuthShell>
  );
}
