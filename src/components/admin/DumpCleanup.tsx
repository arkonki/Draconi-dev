import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '../shared/Button';
import { ConfirmationDialog } from '../shared/ConfirmationDialog';
import { notifyAdminOverviewChanged } from '../../hooks/useAdminOverview';
import { formatBytes } from '../../lib/adminFormat';
import { pruneDeploymentDumps, type PruneResult } from '../../lib/api/adminOverview';

/** Lets an administrator clear out old deployment database dumps after seeing exactly what would go. */
export function DumpCleanup({ dumpCount }: { dumpCount: number }) {
  const [preview, setPreview] = useState<PruneResult | null>(null);
  const [busy, setBusy] = useState<'preview' | 'prune' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const check = async () => {
    setBusy('preview');
    setError(null);
    setNotice(null);
    try {
      const result = await pruneDeploymentDumps(true);
      if (result.prunable === 0) setNotice(`Nothing to clean up. The newest ${result.policy.keep} dumps and anything under ${result.policy.minAgeDays} days old are kept.`);
      else setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check the old dumps.');
    } finally {
      setBusy(null);
    }
  };

  const prune = async () => {
    setBusy('prune');
    try {
      const result = await pruneDeploymentDumps(false);
      const skipped = result.failed.length ? ` ${result.failed.length} could not be removed (file permissions).` : '';
      setNotice(`Removed ${result.prunable} old dump${result.prunable === 1 ? '' : 's'} and freed ${formatBytes(result.bytes)}.${skipped}`);
      setPreview(null);
      notifyAdminOverviewChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the old dumps.');
      setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Old deployment dumps</h3>
          <p className="mt-1 text-sm text-gray-500">
            Every deployment saves a database dump ({dumpCount} stored now). Deployments already clear out the oldest ones; you can also do it here.
            The newest dumps and recent ones are always kept, and recovery sets are never touched.
          </p>
        </div>
        <Button type="button" variant="outline" className="flex-none whitespace-nowrap" icon={Trash2} loading={busy === 'preview'} disabled={dumpCount === 0} onClick={() => void check()}>
          Review old dumps
        </Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-green-800">{notice}</p>}

      <ConfirmationDialog
        isOpen={preview !== null}
        onClose={() => { if (busy !== 'prune') setPreview(null); }}
        onConfirm={() => void prune()}
        title="Remove old database dumps?"
        description={preview && `${preview.prunable} dump${preview.prunable === 1 ? '' : 's'} (${formatBytes(preview.bytes)}) will be permanently deleted. ${preview.kept} will be kept.`}
        confirmText="Remove dumps"
        isLoading={busy === 'prune'}
        isDestructive
      >
        {preview && (
          <ul className="max-h-40 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700">
            {preview.files.map((file) => <li key={file.filename}>{file.filename}</li>)}
          </ul>
        )}
      </ConfirmationDialog>
    </section>
  );
}
