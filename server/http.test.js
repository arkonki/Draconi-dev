import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError, HttpError } from './http.js';

function fakeResponse() {
  const response = { status: null, body: null, req: { requestId: 'request-1' } };
  response.writeHead = (status) => { response.status = status; };
  response.end = (body) => { response.body = JSON.parse(body); };
  return response;
}

describe('error responses', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps what the database said about its own structure out of the response', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = fakeResponse();
    const error = Object.assign(new Error('insert or update on table "characters" violates foreign key constraint "characters_party_id_fkey"'), {
      code: '23503',
      constraint: 'characters_party_id_fkey',
    });

    handleError(response, error);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('23503');
    expect(response.body.error.message).not.toMatch(/characters|constraint|fkey/);
    // The detail is still there for whoever reads the server log.
    expect(warn.mock.calls[0][0]).toContain('characters_party_id_fkey');
  });

  it('answers check and format problems the same way', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const code of ['23514', '22P02']) {
      const response = fakeResponse();
      handleError(response, Object.assign(new Error('invalid input syntax for type uuid: "x" in column secret_column'), { code }));
      expect(response.status).toBe(400);
      expect(response.body.error.message).not.toContain('secret_column');
    }
  });

  it('still sends the messages the application wrote itself', () => {
    const response = fakeResponse();
    handleError(response, new HttpError(403, 'Permission denied', 'FORBIDDEN'));
    expect(response.status).toBe(403);
    expect(response.body.error).toEqual({ message: 'Permission denied', code: 'FORBIDDEN' });
  });
});
