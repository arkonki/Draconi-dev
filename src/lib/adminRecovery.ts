import { authenticatedApiFetch } from './supabase';

export interface RecoveryManifest {
  formatVersion: number;
  createdAtUtc: string;
  applicationVersion: string;
  databaseName: string;
  databaseBytes: number;
  storageBytes: number;
  userCount?: number;
  consistency?: string;
}

export interface StoredBackup {
  filename: string;
  size: number;
  createdAt: string;
  safetyBackup: boolean;
}

export interface StagedBackup {
  restoreToken: string;
  expiresAt: string;
  manifest: RecoveryManifest;
}

async function responseError(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  return new Error(payload.error?.message || response.statusText || 'Recovery request failed');
}

function responseFilename(response: Response, fallback: string) {
  const disposition = response.headers.get('content-disposition') || '';
  return disposition.match(/filename="([^"]+)"/)?.[1] || fallback;
}

async function downloadResponse(response: Response, fallback: string) {
  if (!response.ok) throw await responseError(response);
  const blobUrl = URL.createObjectURL(await response.blob());
  const filename = responseFilename(response, fallback);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
  return filename;
}

export async function listRecoveryBackups() {
  const response = await authenticatedApiFetch('/admin/recovery/backups');
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{ data: StoredBackup[]; databaseName: string }>;
}

export async function createRecoveryBackup() {
  const response = await authenticatedApiFetch('/admin/recovery/backup', { method: 'POST' });
  return downloadResponse(response, 'dragonbane-backup.tar.gz');
}

export async function downloadRecoveryBackup(filename: string) {
  const response = await authenticatedApiFetch(`/admin/recovery/backups/${encodeURIComponent(filename)}`);
  return downloadResponse(response, filename);
}

export async function stageUploadedRecoveryBackup(file: File) {
  const response = await authenticatedApiFetch('/admin/recovery/stage-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/gzip' },
    body: file,
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<StagedBackup>;
}

export async function stageStoredRecoveryBackup(filename: string) {
  const response = await authenticatedApiFetch('/admin/recovery/stage-server', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<StagedBackup>;
}

export async function restoreRecoveryBackup(
  restoreToken: string,
  confirmation: string,
  password: string,
) {
  const response = await authenticatedApiFetch('/admin/recovery/restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ restoreToken, confirmation, password }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{
    restored: true;
    safetyBackup: string;
    manifest: RecoveryManifest;
  }>;
}
