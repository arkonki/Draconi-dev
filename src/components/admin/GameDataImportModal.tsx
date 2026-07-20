import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  canImportGameData,
  gameDataImportTemplate,
  readGameDataImportFile,
  validateGameDataImport,
  type ExistingImportEntry,
  type GameDataImportCategory,
  type GameDataImportPreview,
  type ImportMagicSchool,
} from '../../lib/gameDataImport';
import { Button } from '../shared/Button';
import { ErrorMessage } from '../shared/ErrorMessage';

interface GameDataImportModalProps {
  category: GameDataImportCategory;
  existingEntries: ExistingImportEntry[];
  magicSchools: ImportMagicSchool[];
  onClose: () => void;
  onImported: (count: number) => void | Promise<void>;
}

const PREVIEW_LIMIT = 100;

function downloadTemplate(category: GameDataImportCategory) {
  const template = gameDataImportTemplate(category);
  const url = URL.createObjectURL(new Blob([template.contents], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = template.filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function GameDataImportModal({
  category,
  existingEntries,
  magicSchools,
  onClose,
  onImported,
}: GameDataImportModalProps) {
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<GameDataImportPreview | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidRowCount = useMemo(
    () => preview?.rows.filter((row) => row.errors.length > 0).length ?? 0,
    [preview],
  );
  const isReady = canImportGameData(preview);

  const handleFile = async (file: File | undefined) => {
    setPreview(null);
    setError(null);
    setFileName(file?.name ?? '');
    if (!file) return;

    setReading(true);
    try {
      const rows = await readGameDataImportFile(file);
      setPreview(validateGameDataImport(category, rows, magicSchools, existingEntries));
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'The import file could not be read.');
    } finally {
      setReading(false);
    }
  };

  const handleImport = async () => {
    if (!preview || !canImportGameData(preview)) return;
    setImporting(true);
    setError(null);
    try {
      const table = category === 'items' ? 'game_items' : 'game_spells';
      const { error: importError } = await supabase
        .from(table)
        .insert(preview.rows.map((row) => row.record));
      if (importError) throw new Error(importError.message || `Failed to import ${category}.`);
      await onImported(preview.rows.length);
      onClose();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : `Failed to import ${category}.`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-data-import-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 id="game-data-import-title" className="text-xl font-bold text-gray-900">
              Import {category === 'items' ? 'Items' : 'Spells'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">CSV and Excel (.xlsx), up to 1,000 rows and 5 MB.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            aria-label="Close import dialog"
            className="rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-semibold">Add-only import</p>
            <p className="mt-1">
              Existing records are never overwritten. Unknown columns, duplicate names, invalid values, or missing magic schools
              block the whole import before anything is saved.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <FileSpreadsheet className="h-8 w-8 flex-none text-indigo-600" />
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{fileName || 'Choose a CSV or XLSX file'}</p>
                <p className="text-xs text-gray-500">The first worksheet and first non-empty row are used.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" icon={Download} onClick={() => downloadTemplate(category)}>
                CSV Template
              </Button>
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                <Upload className="mr-2 h-4 w-4" />
                {reading ? 'Reading…' : 'Choose File'}
                <input
                  type="file"
                  className="sr-only"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={reading || importing}
                  onChange={(event) => void handleFile(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>

          {error && <ErrorMessage message={error} onClose={() => setError(null)} />}

          {preview && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rows found</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{preview.rows.length}</p>
                </div>
                <div className={`rounded-lg border p-4 ${invalidRowCount ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invalid rows</p>
                  <p className={`mt-1 text-2xl font-bold ${invalidRowCount ? 'text-red-700' : 'text-green-700'}`}>{invalidRowCount}</p>
                </div>
                <div className={`rounded-lg border p-4 ${preview.fileErrors.length ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">File errors</p>
                  <p className={`mt-1 text-2xl font-bold ${preview.fileErrors.length ? 'text-red-700' : 'text-green-700'}`}>{preview.fileErrors.length}</p>
                </div>
              </div>

              {preview.fileErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" />File errors</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {preview.fileErrors.map((fileError) => <li key={fileError}>{fileError}</li>)}
                  </ul>
                </div>
              )}

              {isReady && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
                  <CheckCircle2 className="h-5 w-5" />
                  All rows passed validation and are ready to import.
                </div>
              )}

              <div className="overflow-hidden rounded-lg border border-gray-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Row</th>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">{category === 'items' ? 'Category' : 'School'}</th>
                        {category === 'spells' && <th className="px-4 py-3">Rank</th>}
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.rows.slice(0, PREVIEW_LIMIT).map((row) => (
                        <tr key={row.rowNumber} className={row.errors.length ? 'bg-red-50/60' : 'bg-white'}>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.rowNumber}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{String(row.record.name || '—')}</td>
                          <td className="px-4 py-3 text-gray-700">
                            {String(category === 'items' ? row.record.category || '—' : row.record.school || 'General')}
                          </td>
                          {category === 'spells' && <td className="px-4 py-3 text-gray-700">{String(row.record.rank ?? '—')}</td>}
                          <td className="px-4 py-3">
                            {row.errors.length ? (
                              <ul className="list-disc space-y-1 pl-4 text-xs text-red-700">
                                {row.errors.map((rowError) => <li key={rowError}>{rowError}</li>)}
                              </ul>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                                <CheckCircle2 className="h-4 w-4" />Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rows.length > PREVIEW_LIMIT && (
                  <p className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
                    Showing the first {PREVIEW_LIMIT} of {preview.rows.length} rows.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={importing}>Cancel</Button>
          <Button
            type="button"
            variant="primary"
            icon={Upload}
            onClick={() => void handleImport()}
            disabled={!isReady || importing}
            loading={importing}
          >
            Import {preview?.rows.length ?? 0} {category === 'items' ? 'Items' : 'Spells'}
          </Button>
        </div>
      </div>
    </div>
  );
}
