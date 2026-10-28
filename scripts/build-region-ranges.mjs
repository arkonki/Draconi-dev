// Builds server/data/allowed-ip-ranges.json: the network address ranges of the countries the site is offered in.
// The source is DB-IP's free "IP to Country Lite" list (CC BY 4.0, https://db-ip.com), updated monthly. Run it again
// once a month, or with other country codes: node scripts/build-region-ranges.mjs EE FI LV LT SE
/* global fetch, URL */
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { isIP } from 'node:net';

const countries = (process.argv.slice(2).length ? process.argv.slice(2) : ['EE', 'FI', 'LV', 'LT', 'SE']).map((code) => code.toUpperCase());
const OUTPUT = new URL('../server/data/allowed-ip-ranges.json', import.meta.url);

const monthOf = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

async function download() {
  // This month's file appears early in the month; until then, last month's is the newest.
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  for (const month of [monthOf(now), monthOf(lastMonth)]) {
    const url = `https://download.db-ip.com/free/dbip-country-lite-${month}.csv.gz`;
    const response = await fetch(url);
    if (response.ok) return { month, text: gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8') };
    console.warn(`${url}: ${response.status}`);
  }
  throw new Error('Could not download the DB-IP country list.');
}

const ipv4ToNumber = (address) => address.split('.').reduce((total, part) => total * 256 + Number(part), 0);

function ipv6ToBigInt(address) {
  const [head, rest] = address.toLowerCase().split('::');
  const headGroups = head ? head.split(':') : [];
  const restGroups = rest !== undefined && rest !== '' ? rest.split(':') : [];
  const groups = rest === undefined ? headGroups : [...headGroups, ...Array(8 - headGroups.length - restGroups.length).fill('0'), ...restGroups];
  return groups.reduce((total, group) => (total << 16n) + BigInt(parseInt(group || '0', 16)), 0n);
}

/** Sorts ranges and joins those that touch or overlap, so the server can binary-search them. */
function merge(ranges, one) {
  ranges.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
  const merged = [];
  for (const [start, end] of ranges) {
    const last = merged.at(-1);
    if (last && start <= last[1] + one) {
      if (end > last[1]) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

const { month, text } = await download();
const wanted = new Set(countries);
const ipv4 = [];
const ipv6 = [];
for (const line of text.split('\n')) {
  const [start, end, country] = line.split(',');
  if (!wanted.has(country?.trim())) continue;
  if (isIP(start) === 4) ipv4.push([ipv4ToNumber(start), ipv4ToNumber(end)]);
  else if (isIP(start) === 6) ipv6.push([ipv6ToBigInt(start), ipv6ToBigInt(end)]);
}

const data = {
  source: `IP Geolocation by DB-IP (https://db-ip.com), country lite ${month}, CC BY 4.0`,
  generatedAt: new Date().toISOString(),
  countries,
  ipv4: merge(ipv4, 1),
  ipv6: merge(ipv6, 1n).map(([start, end]) => [start.toString(16).padStart(32, '0'), end.toString(16).padStart(32, '0')]),
};
await writeFile(OUTPUT, `${JSON.stringify(data)}\n`);
console.log(`Wrote ${data.ipv4.length} IPv4 and ${data.ipv6.length} IPv6 ranges for ${countries.join(', ')} (${month}).`);
