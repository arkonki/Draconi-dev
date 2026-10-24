import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { accountApi, supabase } from '../lib/supabase';
import { passwordSchema } from '../lib/auth/validation';
import { Button } from '../components/shared/Button';
import { AuthNotice, AuthShell, authInputClass } from '../components/auth/AuthShell';

export function Register() {
  const navigate = useNavigate();
  const [open, setOpen] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkInbox, setCheckInbox] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [website, setWebsite] = useState(''); // hidden field: people leave it empty, form-filling bots do not

  useEffect(() => {
    accountApi.config().then(({ data }) => setOpen(Boolean(data?.registrationOpen)));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const name = username.trim();
    if (name.length < 3 || name.length > 50) return setError('Username must be between 3 and 50 characters.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Choose a stronger password.');
    if (password !== confirm) return setError("Passwords don't match.");
    if (!acceptTerms) return setError('Agree to the terms of use and privacy policy to create an account.');

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { username: name, acceptTerms: true, website } } });
    setLoading(false);
    if (signUpError) {
      setError(/duplicate|already/i.test(signUpError.message) ? 'An account with that email or username already exists.' : signUpError.message);
      return;
    }
    // With email set up the account must be confirmed first; without it the server signs the person in straight away.
    if (data?.session) navigate('/', { replace: true });
    else setCheckInbox(true);
  };

  if (open === false) {
    return (
      <AuthShell title="Create account">
        <AuthNotice tone="error">New account creation is currently unavailable.</AuthNotice>
        <p className="text-center text-sm text-gray-600"><Link to="/login" className="font-medium text-blue-600 hover:underline">Back to sign in</Link></p>
      </AuthShell>
    );
  }

  if (checkInbox) {
    return (
      <AuthShell title="Check your email">
        <AuthNotice tone="success">
          We sent a confirmation link to <strong>{email.trim()}</strong>. Open it to activate your account, then sign in. The link works for 24 hours.
        </AuthNotice>
        <p className="text-center text-sm text-gray-600"><Link to="/login" className="font-medium text-blue-600 hover:underline">Go to sign in</Link></p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create account" subtitle="Run campaigns, build characters and join your party">
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        {error && <AuthNotice tone="error">{error}</AuthNotice>}
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700">Username</label>
          <input id="username" type="text" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className={`mt-1 ${authInputClass}`} disabled={loading} />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={`mt-1 ${authInputClass}`} disabled={loading} />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
          <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={`mt-1 ${authInputClass}`} disabled={loading} />
          <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-gray-700">Repeat password</label>
          <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} className={`mt-1 ${authInputClass}`} disabled={loading} />
        </div>
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website (leave empty)</label>
          <input id="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} disabled={loading} />
          <span>I agree to the <Link to="/terms" target="_blank" className="font-medium text-blue-600 underline">terms of use</Link> and the <Link to="/privacy" target="_blank" className="font-medium text-blue-600 underline">privacy policy</Link>.</span>
        </label>
        <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading || open === null}>Create account</Button>
      </form>
      <p className="text-center text-sm text-gray-600">Already have an account? <Link to="/login" className="font-medium text-blue-600 hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
