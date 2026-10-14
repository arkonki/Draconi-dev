// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allowCall, createSseParser, estimateTokens, interpretModelResponse, keyHint, parseSettingsUpdate } from './aiSettings.js';

describe('AI settings', () => {
  it('accepts a key and a model, and trims them', () => {
    expect(parseSettingsUpdate({ apiKey: '  sk-or-v1-abcdef  ', model: ' google/gemini-2.0-flash-001 ' })).toEqual({ apiKey: 'sk-or-v1-abcdef', model: 'google/gemini-2.0-flash-001' });
    expect(parseSettingsUpdate({ model: 'openai/gpt-4o-mini' })).toEqual({ model: 'openai/gpt-4o-mini' });
  });

  it('rejects keys that are obviously wrong and models with odd characters', () => {
    expect(() => parseSettingsUpdate({ apiKey: 'short' })).toThrow(/API key/);
    expect(() => parseSettingsUpdate({ apiKey: 'has a space inside it' })).toThrow(/API key/);
    expect(() => parseSettingsUpdate({ model: 'bad model!' })).toThrow(/model id/);
    expect(() => parseSettingsUpdate({})).toThrow(/Nothing to save/);
  });

  it('only shows the end of a key', () => {
    expect(keyHint('sk-or-v1-abcdef1234')).toBe('…1234');
  });

  it('reads an answer with its usage and cost', () => {
    const result = interpretModelResponse(200, { choices: [{ message: { content: '  The door creaks.  ' } }], usage: { prompt_tokens: 120, completion_tokens: 40, cost: 0.0004 } });
    expect(result).toEqual({ text: 'The door creaks.', usage: { promptTokens: 120, completionTokens: 40, costUsd: 0.0004 } });
    expect(interpretModelResponse(200, { choices: [{ message: { content: 'ok' } }] }).usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: null });
  });

  it('turns provider failures into clear messages', () => {
    expect(() => interpretModelResponse(401, {})).toThrow(/did not accept your API key/);
    expect(() => interpretModelResponse(402, {})).toThrow(/out of credits/);
    expect(() => interpretModelResponse(429, {})).toThrow(/rate limiting/);
    expect(() => interpretModelResponse(500, { error: { message: 'boom' } })).toThrow(/boom/);
    expect(() => interpretModelResponse(200, { choices: [] })).toThrow(/empty answer/);
  });

  it('limits how often one person can call the model', () => {
    const start = 1_000_000;
    for (let index = 0; index < 20; index += 1) expect(allowCall('user-limit', start + index)).toBe(true);
    expect(allowCall('user-limit', start + 25)).toBe(false);
    expect(allowCall('user-limit', start + 61_000)).toBe(true);
    expect(allowCall('another-user', start)).toBe(true);
  });

  it('reads a stream however it is cut into pieces', () => {
    const events = [];
    let done = 0;
    const parser = createSseParser({ onEvent: (event) => events.push(event), onDone: () => { done += 1; } });
    const stream = ': PROCESSING\n\ndata: {"choices":[{"delta":{"content":"The "}}]}\r\n\ndata: {"choices":[{"delta":{"content":"door."}}]}\n\ndata: {"usage":{"prompt_tokens":5}}\n\ndata: [DONE]\n\n';
    for (let index = 0; index < stream.length; index += 7) parser.feed(stream.slice(index, index + 7));
    parser.end();
    expect(events.map((event) => event.choices?.[0]?.delta?.content ?? null)).toEqual(['The ', 'door.', null]);
    expect(events[2].usage.prompt_tokens).toBe(5);
    expect(done).toBe(1);
  });

  it('ignores broken lines and handles a final line without a newline', () => {
    const events = [];
    const parser = createSseParser({ onEvent: (event) => events.push(event) });
    parser.feed('data: {broken\ndata: {"a":1}');
    parser.end();
    expect(events).toEqual([{ a: 1 }]);
  });

  it('estimates tokens when none are reported', () => {
    expect(estimateTokens('12345678')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });
});
