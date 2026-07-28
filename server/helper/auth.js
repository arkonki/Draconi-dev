import { timingSafeEqual } from 'node:crypto';
import { authenticateAccessToken } from '../auth.js';
import { pool } from '../db.js';
import { getBearerToken } from '../http.js';
import { HelperError } from './errors.js';

const rateWindows = new Map();

function equalSecret(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function developmentUser() {
  const email = String(process.env.DEVELOPMENT_USER_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) {
    throw new HelperError(
      503,
      'AUTH_CONFIGURATION_ERROR',
      'DEVELOPMENT_USER_EMAIL or ADMIN_EMAIL must be configured for development-token authentication.',
    );
  }
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE lower(email) = $1 AND is_active = true',
    [email],
  );
  if (!rows[0]) {
    throw new HelperError(503, 'AUTH_CONFIGURATION_ERROR', 'The configured development-token user does not exist.');
  }
  return rows[0];
}

export async function authenticateHelperRequest(request) {
  const token = getBearerToken(request);
  if (!token) throw new HelperError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required.');

  const authMode = process.env.AUTH_MODE || 'development_token';
  const developmentToken = process.env.DEVELOPMENT_TOKEN;
  if (authMode === 'development_token' && developmentToken && equalSecret(token, developmentToken)) {
    return developmentUser();
  }

  return authenticateAccessToken(token, true);
}

export function enforceHelperRateLimit(request, user) {
  const windowMs = 60_000;
  const limit = Math.max(10, Number(process.env.HELPER_RATE_LIMIT_PER_MINUTE || 120));
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || request.socket?.remoteAddress || 'unknown';
  const key = `${user.id}:${address}`;
  const now = Date.now();
  const current = rateWindows.get(key);

  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) {
    throw new HelperError(429, 'RATE_LIMITED', 'Too many Helper API requests. Try again shortly.');
  }

  if (rateWindows.size > 5_000) {
    for (const [entryKey, entry] of rateWindows) {
      if (entry.resetAt <= now) rateWindows.delete(entryKey);
    }
  }
}

export async function requireCampaignAccess(client, user, campaignId, { gm = false } = {}) {
  const { rows } = await client.query(
    `SELECT p.*,
       EXISTS (
         SELECT 1 FROM party_members pm
         WHERE pm.party_id = p.id AND pm.user_id = $2
       ) AS is_member
     FROM parties p
     WHERE p.id = $1`,
    [campaignId, user.id],
  );
  const campaign = rows[0];
  if (!campaign) throw new HelperError(404, 'NOT_FOUND', 'Campaign not found.');

  const isOwner = campaign.created_by === user.id;
  const isAdmin = user.role === 'admin';
  const isGm = isAdmin || isOwner || (campaign.is_member && user.role === 'dm');
  const canRead = isGm || campaign.is_member;
  if (!canRead || (gm && !isGm)) {
    throw new HelperError(403, 'PERMISSION_DENIED', 'You do not have permission for this campaign operation.');
  }
  return {
    campaign,
    role: isOwner ? 'owner' : isGm ? 'gm' : 'player',
    isGm,
  };
}

