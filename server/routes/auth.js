import { deleteMyAccount, exportMyData } from '../accountData.js';
import { requestPasswordReset, resendVerification, resetPassword as resetPasswordWithToken, verifyEmail } from '../accountEmails.js';
import { currentUser, hashPassword, publicUser, registrationPlaces, sessionForRequest, signIn, signOut, signUp, updateAuthUser } from '../auth.js';
import { readJson, sendJson } from '../http.js';
import { legalContact } from '../legal.js';
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from '../loginRateLimit.js';
import { mailEnabled } from '../mailer.js';
import { assertSignUpRegion, regionStatus } from '../regionGuard.js';
import { checkSignup } from '../signupGuard.js';
import { signedIn } from './router.js';

const open = (work, status = 200) => async (context) => sendJson(context.response, status, await work(context));

export const authRoutes = [
  ['GET', '/api/auth/session', open(async ({ request }) => ({ session: await sessionForRequest(request) }))],
  ['POST', '/api/auth/sign-in', async ({ request, response }) => {
    const credentials = await readJson(request);
    assertLoginAllowed(request, credentials.email);
    try {
      sendJson(response, 200, await signIn(credentials));
      clearLoginFailures(request, credentials.email);
    } catch (error) {
      if (error?.code === 'INVALID_CREDENTIALS') recordLoginFailure(request, credentials.email);
      throw error;
    }
  }],
  ['POST', '/api/auth/sign-up', async ({ request, response }) => {
    // Only an administrator creates accounts for other people. Anyone else, including someone who is still signed in
    // on this browser, signs up the ordinary way, with the same terms, region and place checks.
    const signedInUser = await currentUser(request, false);
    const actor = signedInUser?.role === 'admin' ? signedInUser : null;
    const body = await readJson(request);
    // Only an administrator can create an account for someone outside the allowed countries.
    if (!actor) assertSignUpRegion(request);
    if (!actor && checkSignup(request, body) === 'bot') {
      // A bot filled in the hidden field: answer as if it worked, and create nothing.
      sendJson(response, 201, { user: null, session: null, verificationRequired: true });
      return;
    }
    sendJson(response, 201, await signUp(actor, body));
  }],
  ['GET', '/api/auth/config', open(async ({ request }) => {
    const region = regionStatus(request);
    const places = await registrationPlaces();
    return {
      registrationOpen: process.env.ALLOW_REGISTRATION === 'true' && region.allowed && !places.full,
      registrationFull: places.full,
      emailEnabled: mailEnabled(),
      legal: legalContact(),
      region,
    };
  })],
  ['POST', '/api/auth/password-reset/request', open(async ({ request }) => requestPasswordReset(request, await readJson(request, 10_000)))],
  ['POST', '/api/auth/password-reset/confirm', open(async ({ request }) => resetPasswordWithToken(await readJson(request, 10_000), hashPassword))],
  ['POST', '/api/auth/verify-email', open(async ({ request }) => verifyEmail(await readJson(request, 10_000)))],
  ['POST', '/api/auth/verify-email/resend', open(async ({ request }) => resendVerification(request, await readJson(request, 10_000)))],
  ['GET', '/api/auth/export', async ({ request, response }) => {
    const exported = await exportMyData(await currentUser(request));
    const body = JSON.stringify(exported, null, 2);
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': 'attachment; filename="draconi-my-data.json"',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
    });
    response.end(body);
  }],
  ['DELETE', '/api/auth/account', signedIn(async (user, { request }) => deleteMyAccount(request, user, await readJson(request, 10_000)))],
  ['POST', '/api/auth/sign-out', open(async ({ request }) => {
    await signOut(request);
    return {};
  })],
  ['GET', '/api/auth/user', signedIn((user) => ({ user: publicUser(user) }))],
  ['PUT', '/api/auth/user', open(async ({ request }) => updateAuthUser(request, await readJson(request)))],
];
