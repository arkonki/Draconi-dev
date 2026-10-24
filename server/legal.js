// The version of the terms and privacy text people agree to when they register. Change it whenever the wording
// changes in a way that matters, so it is clear which text each account accepted.
export const TERMS_VERSION = '2026-10-24';

export function legalContact(env = process.env) {
  return {
    operator: String(env.LEGAL_OPERATOR_NAME || '').trim(),
    contactEmail: String(env.LEGAL_CONTACT_EMAIL || '').trim(),
    termsVersion: TERMS_VERSION,
  };
}
