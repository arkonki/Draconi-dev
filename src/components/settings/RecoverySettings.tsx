import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileArchive, Loader2, RefreshCw, ShieldAlert, Upload } from 'lucide-react';
import {
  createRecoveryBackup,
  downloadRecoveryBackup,
  listRecoveryBackups,
  restoreRecoveryBackup,
  stageStoredRecoveryBackup,
  stageUploadedRecoveryBackup,
  type StagedBackup,
  type StoredBackup,
} from '../../lib/adminRecovery';
import { clearLocalSession } from '../../lib/supabase';

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The recovery operation failed.';
}

export function RecoverySettings() {
  const [backups, setBackups] = useState<StoredBackup[]>([]);
  const [databaseName, setDatabaseName] = useState('dragonbane');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [staged, setStaged] = useState<StagedBackup | null>(null);
  const [stagedLabel, setStagedLabel] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'list' | 'backup' | 'validate' | 'restore' | null>('list');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshBackups = useCallback(async () => {
    setBusy((current) => current || 'list');
    try {
      const result = await listRecoveryBackups();
      setBackups(result.data);
      setDatabaseName(result.databaseName);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setBusy((current) => current === 'list' ? null : current);
    }
  }, []);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  const resetMessages = () => {
    setError(null);
    setNotice(null);
  };

  const handleCreateBackup = async () => {
    resetMessages();
    setBusy('backup');
    try {
      const filename = await createRecoveryBackup();
      setNotice(`Backup created, validated, retained on the server, and downloaded as ${filename}.`);
      await refreshBackups();
    } catch (backupError) {
      setError(errorMessage(backupError));
    } finally {
      setBusy(null);
    }
  };

  const stageBackup = async (action: () => Promise<StagedBackup>, label: string) => {
    resetMessages();
    setBusy('validate');
    setStaged(null);
    try {
      const result = await action();
      setStaged(result);
      setStagedLabel(label);
      setConfirmation('');
      setPassword('');
      setNotice('The backup passed checksum, archive, PostgreSQL catalog, and storage-path validation.');
    } catch (validationError) {
      setError(errorMessage(validationError));
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    if (!staged) return;
    resetMessages();
    setBusy('restore');
    try {
      const result = await restoreRecoveryBackup(staged.restoreToken, confirmation, password);
      clearLocalSession();
      setNotice(`Restore completed. Safety backup: ${result.safetyBackup}. Redirecting to sign in…`);
      window.setTimeout(() => window.location.assign('/login'), 1800);
    } catch (restoreError) {
      setError(errorMessage(restoreError));
      setBusy(null);
    }
  };

  const expectedConfirmation = `RESTORE ${databaseName}`;
  const restoreEnabled = Boolean(staged && confirmation === expectedConfirmation && password && busy === null);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-gray-600">
          Create complete recovery sets containing PostgreSQL data and uploaded files. Only administrators can access these controls.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 flex-none" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 flex-none" />
          <span>{notice}</span>
        </div>
      )}

      <section className="rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Create a recovery set</h3>
            <p className="mt-1 text-sm text-gray-500">Writes pause briefly while a consistent database and file snapshot is generated and verified.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleCreateBackup()}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Create &amp; download
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">Server recovery sets</h3>
            <p className="mt-1 text-sm text-gray-500">Includes automatic safety copies made immediately before a restore.</p>
          </div>
          <button
            type="button"
            aria-label="Refresh recovery sets"
            onClick={() => void refreshBackups()}
            disabled={busy !== null}
            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy === 'list' ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {backups.length === 0 && busy !== 'list' ? (
          <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No server recovery sets yet.</div>
        ) : (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {backups.map((backup) => (
              <div key={backup.filename} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileArchive className="h-4 w-4 flex-none text-indigo-500" />
                    <span className="truncate text-sm font-medium text-gray-800">{backup.filename}</span>
                    {backup.safetyBackup && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Safety</span>}
                  </div>
                  <p className="mt-1 pl-6 text-xs text-gray-500">{new Date(backup.createdAt).toLocaleString()} · {formatBytes(backup.size)}</p>
                </div>
                <div className="flex gap-2 pl-6 sm:pl-0">
                  <button
                    type="button"
                    onClick={() => void downloadRecoveryBackup(backup.filename).catch((downloadError) => setError(errorMessage(downloadError)))}
                    disabled={busy !== null}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => void stageBackup(() => stageStoredRecoveryBackup(backup.filename), backup.filename)}
                    disabled={busy !== null}
                    className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    Prepare restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 p-5">
        <div className="mb-4">
          <h3 className="font-semibold text-gray-900">Upload a recovery set</h3>
          <p className="mt-1 text-sm text-gray-500">Select a `.tar.gz` recovery set. Validation never changes live data.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="file"
            accept=".tar.gz,.tgz,application/gzip"
            onChange={(event) => {
              setSelectedFile(event.target.files?.[0] || null);
              setStaged(null);
              resetMessages();
            }}
            disabled={busy !== null}
            className="block min-w-0 flex-1 text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
          <button
            type="button"
            disabled={!selectedFile || busy !== null}
            onClick={() => selectedFile && void stageBackup(() => stageUploadedRecoveryBackup(selectedFile), selectedFile.name)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'validate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Validate upload
          </button>
        </div>
      </section>

      {staged && (
        <section className="rounded-xl border-2 border-red-200 bg-red-50/40 p-5">
          <div className="flex gap-3">
            <ShieldAlert className="h-6 w-6 flex-none text-red-600" />
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-red-900">Restore validated recovery set</h3>
              <p className="mt-1 break-all text-sm text-red-800">{stagedLabel}</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-gray-500">Created</dt><dd className="font-medium text-gray-900">{new Date(staged.manifest.createdAtUtc).toLocaleString()}</dd></div>
                <div><dt className="text-gray-500">Application version</dt><dd className="font-medium text-gray-900">{staged.manifest.applicationVersion}</dd></div>
                <div><dt className="text-gray-500">Source database</dt><dd className="font-medium text-gray-900">{staged.manifest.databaseName}</dd></div>
                <div><dt className="text-gray-500">Payload</dt><dd className="font-medium text-gray-900">{formatBytes(staged.manifest.databaseBytes + staged.manifest.storageBytes)}</dd></div>
              </dl>
              <div className="mt-5 rounded-lg bg-white p-4 text-sm text-gray-700">
                Restoring replaces database records and uploaded files. A verified safety backup is created first, and all active application requests are drained.
              </div>
              <div className="mt-5 grid gap-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-800">Type <code className="rounded bg-red-100 px-1.5 py-0.5">{expectedConfirmation}</code></span>
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-800">Current administrator password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                  />
                </label>
                <button
                  type="button"
                  disabled={!restoreEnabled}
                  onClick={() => void handleRestore()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                  Restore database and files
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
