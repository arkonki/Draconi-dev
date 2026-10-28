import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { HttpError, clientAddress } from './http.js';

// The site is offered in a few countries only. A visitor's country comes from their network address, looked up in a
// list of the allowed countries' address ranges (built by scripts/build-region-ranges.mjs from DB-IP's free country
// data). Signing up needs an allowed country. Without a session, the API answers only from an allowed country,
// except for signing in and its helpers, so someone with an account can still use the site while travelling.

export const COUNTRY_NAMES = Object.freeze({ EE: 'Estonia', FI: 'Finland', LV: 'Latvia', LT: 'Lithuania', SE: 'Sweden' });
const DATA_FILE = new URL('./data/allowed-ip-ranges.json', import.meta.url);

/** Paths anyone may call from anywhere: health checks, signing in and recovering an account, and this status. */
const OPEN_PATHS = new Set([
  '/api/health',
  '/api/auth/config',
  '/api/auth/session',
  '/api/auth/sign-in',
  '/api/auth/password-reset/request',
  '/api/auth/password-reset/confirm',
  '/api/auth/verify-email',
  '/api/auth/verify-email/resend',
  // A table display opened with its own secret link, which a GM shares on purpose.
  '/api/functions/get-player-display-state',
]);

function ipv4ToNumber(address) {
  return address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

function ipv6ToBigInt(address) {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  // An IPv4 tail such as ::ffff:1.2.3.4 becomes two hex groups.
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const value = ipv4ToNumber(tail[1]);
    text = `${text.slice(0, -tail[1].length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head, rest] = text.split('::');
  const headGroups = head ? head.split(':') : [];
  const restGroups = rest !== undefined && rest !== '' ? rest.split(':') : [];
  const missing = 8 - headGroups.length - restGroups.length;
  const groups = rest === undefined ? headGroups : [...headGroups, ...Array(missing).fill('0'), ...restGroups];
  return groups.reduce((total, group) => (total << 16n) + BigInt(parseInt(group || '0', 16)), 0n);
}

/** Loopback, private and link-local addresses: the server itself, a local proxy, or development. */
export function isPrivateAddress(address) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (version === 6) {
    const value = ipv6ToBigInt(address);
    if (value === 1n) return true;
    if (value >> 32n === 0xffffn) return isPrivateAddress([24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)).join('.'));
    const top = Number(value >> 112n);
    return (top & 0xfe00) === 0xfc00 || (top & 0xffc0) === 0xfe80;
  }
  return false;
}

/** True when `value` falls in one of the sorted, non-overlapping [start, end] ranges. */
function inRanges(ranges, value) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const [start, end] = ranges[middle];
    if (value < start) high = middle - 1;
    else if (value > end) low = middle + 1;
    else return true;
  }
  return false;
}

/** Builds the lookup from the data file's contents. */
export function createRegionLookup(data) {
  const ipv4 = (data?.ipv4 ?? []).map(([start, end]) => [Number(start), Number(end)]);
  const ipv6 = (data?.ipv6 ?? []).map(([start, end]) => [BigInt(`0x${start}`), BigInt(`0x${end}`)]);
  return {
    countries: Array.isArray(data?.countries) ? data.countries : [],
    source: data?.source ?? null,
    isAllowed(address) {
      const plain = String(address ?? '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
      if (isPrivateAddress(plain)) return true;
      const version = isIP(plain);
      if (version === 4) return inRanges(ipv4, ipv4ToNumber(plain));
      if (version === 6) return inRanges(ipv6, ipv6ToBigInt(plain));
      return false;
    },
  };
}

let lookup = null;
let loadFailed = false;

function regionLookup() {
  if (lookup || loadFailed) return lookup;
  try {
    lookup = createRegionLookup(JSON.parse(readFileSync(DATA_FILE, 'utf8')));
  } catch (error) {
    // Without the list the limit cannot be applied; the site stays open rather than shutting everyone out.
    loadFailed = true;
    console.error(`Region limit is off: ${DATA_FILE.pathname} could not be read (${error.message}). Run npm run build:region-ranges.`);
  }
  return lookup;
}

/** Whether the limit is on: REGION_LIMIT=off switches it off, and it needs the address list. */
export function regionLimitActive() {
  return process.env.REGION_LIMIT !== 'off' && Boolean(regionLookup());
}

/** Where this request comes from, as far as the limit is concerned. */
export function regionStatus(request) {
  const active = regionLimitActive();
  const countries = active ? regionLookup().countries : [];
  return {
    limited: active,
    allowed: !active || regionLookup().isAllowed(clientAddress(request)),
    countries: countries.map((code) => ({ code, name: COUNTRY_NAMES[code] ?? code })),
  };
}

export class RegionUnavailableError extends HttpError {
  constructor(message) {
    super(451, message, 'REGION_NOT_AVAILABLE');
  }
}

const countryList = () => {
  const names = regionStatus({ headers: {}, socket: {} }).countries.map((country) => country.name);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? '';
};

/** Refuses a self-service sign-up from outside the allowed countries. */
export function assertSignUpRegion(request) {
  if (!regionStatus(request).allowed) {
    throw new RegionUnavailableError(`New accounts can only be created in ${countryList()}.`);
  }
}

/**
 * Refuses an API request without a session from outside the allowed countries, apart from signing in and the other
 * open paths. A request that carries a session token goes on: an invalid one is turned away by the route itself.
 */
export function assertRegionAccess(request, pathname, hasSession) {
  if (hasSession || OPEN_PATHS.has(pathname) || !pathname.startsWith('/api/')) return;
  // Uploaded images are public links that the browser loads without a session, also for someone signed in abroad.
  if (pathname.startsWith('/api/storage/public/')) return;
  if (!regionStatus(request).allowed) {
    throw new RegionUnavailableError(`This site is available in ${countryList()}. If you already have an account, sign in to continue.`);
  }
}
