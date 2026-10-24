import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { accountApi } from '../lib/supabase';
import { AuthNotice, AuthShell } from '../components/auth/AuthShell';

export function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get('token') ?? '');
  const [state, setState] = useState<{ status: 'working' | 'done' | 'failed'; message?: string }>({ status: token ? 'working' : 'failed', message: token ? undefined : 'This link is incomplete.' });
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // React strict mode runs effects twice; the link works only once.
    window.history.replaceState(null, '', window.location.pathname);
    accountApi.verifyEmail(token).then(({ error }) => {
      setState(error ? { status: 'failed', message: error.message } : { status: 'done' });
    });
  }, [token]);

  return (
    <AuthShell title="Confirm your email">
      {state.status === 'working' && <p className="text-center text-sm text-gray-600" role="status">Confirming your address…</p>}
      {state.status === 'done' && <AuthNotice tone="success">Your email address is confirmed. You can sign in now.</AuthNotice>}
      {state.status === 'failed' && <AuthNotice tone="error">{state.message} Sign in to request a new confirmation email.</AuthNotice>}
      <p className="text-center text-sm text-gray-600"><Link to="/login" className="font-medium text-blue-600 hover:underline">Go to sign in</Link></p>
    </AuthShell>
  );
}
