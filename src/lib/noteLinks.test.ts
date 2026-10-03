import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNotePath, parseNoteLink } from './noteLinks';
import { loginDestination } from './loginDestination';

afterEach(() => vi.unstubAllEnvs());

describe('journal URLs', () => {
  it('builds canonical party and personal links with encoded identifiers', () => {
    expect(getNotePath('entry 1', 'party 1')).toBe('/party/party%201?noteId=entry+1');
    expect(getNotePath('private')).toBe('/notes?noteId=private');
  });
  it.each(['/party/p?noteId=n', '/adventure-party/p?tab=notes&noteId=n'])('recognizes %s', path => {
    expect(parseNoteLink(`${window.location.origin}${path}`)).toEqual({ partyId: 'p', noteId: 'n' });
  });
  it('recognizes personal journal links', () => {
    expect(parseNoteLink('/notes?noteId=n')).toEqual({ noteId: 'n' });
  });
  it('respects subdirectory hosting', () => {
    vi.stubEnv('BASE_URL', '/draconi/');
    expect(parseNoteLink('/draconi/party/p?noteId=n')).toEqual({ partyId: 'p', noteId: 'n' });
    expect(parseNoteLink('/party/p?noteId=n')).toBeNull();
  });
  it.each(['https://example.com/party/p?noteId=n', '/party/p', '/characters?noteId=n', '/party/%ZZ?noteId=n'])('does not intercept unrelated or invalid link %s', path => {
    expect(parseNoteLink(path)).toBeNull();
  });
});

describe('login return destination', () => {
  it('preserves the requested journal query and hash after login', () => {
    expect(loginDestination({ from: { pathname: '/adventure-party/p', search: '?noteId=n', hash: '#journal' } })).toBe('/adventure-party/p?noteId=n#journal');
  });
  it.each([null, {}, { from: { pathname: '//example.com' } }, { from: { pathname: '/\\example.com' } }, { from: { pathname: '/login/' } }, { from: { pathname: 'https://example.com' } }])('rejects missing or unsafe state %j', state => {
    expect(loginDestination(state)).toBe('/');
  });
});
