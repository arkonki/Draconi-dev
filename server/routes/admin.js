import { aiUsageOverview } from '../adminAiUsage.js';
import { getAlertsAdminView, saveAlertSettings, sendTestAlert } from '../adminAlerts.js';
import { listAllConnections, revokeConnections } from '../adminConnections.js';
import { adminOverview, pruneBackups } from '../adminOverview.js';
import { deleteUser, listAuditLog, listUsers, resetPassword, revokeUserSessions, updateUser, userImpact } from '../adminUsers.js';
import { currentUser } from '../auth.js';
import { automaticBackupStatus, runAutomaticBackupNow } from '../automaticBackups.js';
import { gameDataUsage } from '../gameDataUsage.js';
import { housekeepingStatus, runHousekeepingNow } from '../housekeeping.js';
import { readJson } from '../http.js';
import { performanceStatus, resetPerformanceMetrics } from '../performance.js';
import {
  createAndDownloadBackup,
  downloadStoredBackup,
  listBackups,
  recoveryDatabaseName,
  restoreStagedBackup,
  stageStoredBackup,
  stageUploadedBackup,
} from '../recovery.js';
import { clearSmtp, getSmtpAdminView, saveSmtp, sendSmtpTest } from '../smtpSettings.js';
import { signedIn } from './router.js';

// Every function called here checks for itself that the person is an administrator.
export const adminRoutes = [
  ['GET', '/api/admin/users', signedIn((user) => listUsers(user))],
  ['GET', '/api/admin/alerts', signedIn((user) => getAlertsAdminView(user))],
  ['PUT', '/api/admin/alerts', signedIn(async (user, { request }) => saveAlertSettings(user, await readJson(request, 20_000)))],
  ['POST', '/api/admin/alerts/test', signedIn((user) => sendTestAlert(user))],
  ['GET', '/api/admin/smtp', signedIn((user) => getSmtpAdminView(user))],
  ['PUT', '/api/admin/smtp', signedIn(async (user, { request }) => saveSmtp(user, await readJson(request, 20_000)))],
  ['DELETE', '/api/admin/smtp', signedIn((user) => clearSmtp(user))],
  ['POST', '/api/admin/smtp/test', signedIn(async (user, { request }) => sendSmtpTest(user, await readJson(request, 20_000)))],
  ['GET', '/api/admin/ai-usage', signedIn((user, { query }) => aiUsageOverview(user, { month: query.get('month') || undefined }))],
  ['GET', '/api/admin/connections', signedIn((user) => listAllConnections(user))],
  ['POST', '/api/admin/connections/revoke', signedIn(async (user, { request }) => revokeConnections(user, await readJson(request)))],
  ['GET', '/api/admin/audit', signedIn((user, { query }) => listAuditLog(user, { limit: query.get('limit'), userId: query.get('user') }))],
  ['GET', '/api/admin/overview', signedIn((user) => adminOverview(user))],
  ['GET', '/api/admin/backups/automatic', signedIn((user) => automaticBackupStatus(user))],
  ['POST', '/api/admin/backups/automatic/run', signedIn((user) => runAutomaticBackupNow(user))],
  ['POST', '/api/admin/backups/prune', signedIn(async (user, { request }) => {
    const body = await readJson(request);
    return pruneBackups(user, { dryRun: body?.dryRun !== false });
  })],
  ['GET', /^\/api\/admin\/game-data\/([^/]+)\/([^/]+)\/usage$/, signedIn((user, { params }) => gameDataUsage(user, { category: params[0], id: params[1] }))],

  ['PATCH', /^\/api\/admin\/users\/([^/]+)$/, signedIn(async (user, { request, params }) => updateUser(user, params[0], await readJson(request)))],
  ['DELETE', /^\/api\/admin\/users\/([^/]+)$/, signedIn(async (user, { request, params }) => deleteUser(user, params[0], await readJson(request)))],
  ['GET', /^\/api\/admin\/users\/([^/]+)\/impact$/, signedIn((user, { params }) => userImpact(user, params[0]))],
  ['POST', /^\/api\/admin\/users\/([^/]+)\/reset-password$/, signedIn(async (user, { request, params }) => resetPassword(user, params[0], await readJson(request)))],
  ['POST', /^\/api\/admin\/users\/([^/]+)\/revoke-sessions$/, signedIn((user, { params }) => revokeUserSessions(user, params[0]))],

  ['GET', '/api/admin/housekeeping', signedIn((user) => housekeepingStatus(user))],
  ['POST', '/api/admin/housekeeping/run', signedIn((user) => runHousekeepingNow(user))],
  ['GET', '/api/admin/performance', signedIn((user) => performanceStatus(user))],
  ['POST', '/api/admin/performance/reset', signedIn((user) => resetPerformanceMetrics(user))],

  // Backups are streamed, so these two write the response themselves.
  ['POST', '/api/admin/recovery/backup', async ({ request, response }) => createAndDownloadBackup(response, await currentUser(request))],
  ['GET', '/api/admin/recovery/backups', signedIn(async (user) => ({ data: await listBackups(user), databaseName: recoveryDatabaseName() }))],
  ['GET', /^\/api\/admin\/recovery\/backups\/([^/]+)$/, async ({ request, response, params }) => downloadStoredBackup(response, await currentUser(request), params[0])],
  ['POST', '/api/admin/recovery/stage-upload', signedIn((user, { request }) => stageUploadedBackup(request, user))],
  ['POST', '/api/admin/recovery/stage-server', signedIn(async (user, { request }) => stageStoredBackup(user, (await readJson(request, 50_000)).filename))],
  ['POST', '/api/admin/recovery/restore', signedIn(async (user, { request }) => restoreStagedBackup(user, await readJson(request, 50_000)))],
];
