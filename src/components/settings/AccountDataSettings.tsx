import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../shared/Button';
import { authenticatedApiFetch, clearLocalSession } from '../../lib/supabase';
import { useAuth } from '../../contexts/useAuth';

async function failure(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  return new Error(payload.error?.message || response.statusText || 'The request failed');
}

/** Download everything the site holds about you, or delete your account. */
export function AccountDataSettings() {
  const { role } = useAuth();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');

  const download = async () => {
    setBusy('export');
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedApiFetch('/auth/export');
      if (!response.ok) throw await failure(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'draconi-my-data.json';
      link.click();
      URL.revokeObjectURL(url);
      setNotice('Your data was downloaded as draconi-my-data.json.');
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'The download failed.');
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('delete');
    setError(null);
    try {
      const response = await authenticatedApiFetch('/auth/account', {
        method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }),
      });
      if (!response.ok) throw await failure(response);
      clearLocalSession();
      window.location.assign('/login');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The account could not be deleted.');
      setBusy(null);
    }
  };

  return (
    <section className="mx-auto mt-12 max-w-3xl space-y-6 border-t border-gray-200 pt-8" aria-labelledby="account-data-heading">
      <h2 id="account-data-heading" className="text-xl font-bold text-gray-900">Your data</h2>
      <p className="text-sm text-gray-600">
        See what we keep and why in the <Link to="/privacy" className="font-medium text-blue-600 underline">privacy policy</Link>.
      </p>

      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Download my data</h3>
          <p className="text-sm text-gray-600">Your profile, characters, notes, messages and the list of images you uploaded, as one JSON file.</p>
        </div>
        <Button type="button" variant="outline" icon={Download} loading={busy === 'export'} disabled={busy !== null} onClick={download}>Download</Button>
      </div>

      <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
        <h3 className="font-semibold text-red-900">Delete my account</h3>
        {role === 'admin' ? (
          <p className="mt-1 text-sm text-red-900">Administrator accounts must be removed by another administrator.</p>
        ) : confirming ? (
          <form onSubmit={deleteAccount} className="mt-2 space-y-3">
            <p className="text-sm text-red-900">
              This permanently deletes your profile, characters, notes, messages and uploaded images. It cannot be undone.
              If you run campaigns, an administrator has to hand them over first.
            </p>
            <label htmlFor="delete-password" className="block text-sm font-medium text-gray-800">Your password</label>
            <input
              id="delete-password" type="password" autoComplete="current-password" required value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <Button type="submit" variant="danger" icon={Trash2} loading={busy === 'delete'} disabled={busy !== null || !password}>Delete everything</Button>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => { setConfirming(false); setPassword(''); }}>Cancel</Button>
            </div>
          </form>
        ) : (
          <>
            <p className="mt-1 text-sm text-red-900">Remove your account and everything you created.</p>
            <Button type="button" variant="outline" icon={Trash2} className="mt-3 text-red-700" onClick={() => setConfirming(true)}>Delete my account…</Button>
          </>
        )}
      </div>
    </section>
  );
}
