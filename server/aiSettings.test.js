// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { allowCall, answerText, capReached, createSseParser, estimateTokens, interpretModelResponse, keyHint, modelCallFailure, parseSettingsUpdate, readUsage, withCacheControl } from './aiSettings.js';

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
    expect(result).toEqual({ text: 'The door creaks.', usage: { promptTokens: 120, completionTokens: 40, cachedTokens: 0, costUsd: 0.0004 }, truncated: false });
    expect(interpretModelResponse(200, { choices: [{ finish_reason: 'length', message: { content: 'The door cr' } }] }).truncated).toBe(true);
    expect(interpretModelResponse(200, { choices: [{ message: { content: 'ok' } }] }).usage).toEqual({ promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: null });
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

  it('accepts monthly limits and lets them be removed', () => {
    expect(parseSettingsUpdate({ monthlyCostCapUsd: '5.456' })).toEqual({ monthlyCostCapUsd: 5.46 });
    expect(parseSettingsUpdate({ monthlyCostCapUsd: null, monthlyTokenCap: '' })).toEqual({ monthlyCostCapUsd: null, monthlyTokenCap: null });
    expect(parseSettingsUpdate({ monthlyTokenCap: 250000 })).toEqual({ monthlyTokenCap: 250000 });
    expect(() => parseSettingsUpdate({ monthlyCostCapUsd: -1 })).toThrow(/money limit/);
    expect(() => parseSettingsUpdate({ monthlyCostCapUsd: 'abc' })).toThrow(/money limit/);
    expect(() => parseSettingsUpdate({ monthlyTokenCap: 10 })).toThrow(/token limit/);
    expect(() => parseSettingsUpdate({ monthlyTokenCap: 1500.5 })).toThrow(/token limit/);
  });

  it('stops at a limit, naming it', () => {
    expect(capReached({ costCapUsd: null, tokenCap: null }, { tokens: 9e9, costUsd: 9e9 })).toBeNull();
    expect(capReached({ costCapUsd: 5, tokenCap: null }, { tokens: 1, costUsd: 4.99 })).toBeNull();
    expect(capReached({ costCapUsd: 5, tokenCap: null }, { tokens: 1, costUsd: 5 })).toMatch(/\$5\.00/);
    expect(capReached({ costCapUsd: null, tokenCap: 100000 }, { tokens: 100000, costUsd: 0 })).toMatch(/100,000 tokens/);
    expect(capReached({ costCapUsd: 5, tokenCap: 100000 }, { tokens: 10, costUsd: 0 })).toBeNull();
  });

  it('reads how much of the input came from the provider\'s cache', () => {
    expect(readUsage({ prompt_tokens: 2000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 1536 }, cost: 0.001 })).toEqual({ promptTokens: 2000, completionTokens: 100, cachedTokens: 1536, costUsd: 0.001 });
    expect(readUsage(undefined)).toEqual({ promptTokens: 0, completionTokens: 0, cachedTokens: 0, costUsd: null });
  });

  it('marks the fixed start of the conversation for caching only on models that need it', () => {
    const messages = [{ role: 'system', content: 'Fixed instructions' }, { role: 'user', content: 'Hello' }];
    expect(withCacheControl('openai/gpt-4o-mini', messages)).toBe(messages);
    expect(withCacheControl('google/gemini-2.0-flash-001', messages)).toBe(messages);
    const marked = withCacheControl('anthropic/claude-3.5-haiku', messages);
    expect(marked[0]).toEqual({ role: 'system', content: [{ type: 'text', text: 'Fixed instructions', cache_control: { type: 'ephemeral' } }] });
    expect(marked[1]).toBe(messages[1]);
    expect(withCacheControl('anthropic/claude-3.5-haiku', [{ role: 'user', content: 'x' }])).toEqual([{ role: 'user', content: 'x' }]);
  });
});

describe('answers that arrive in an unusual shape', () => {
  it('reads an answer sent as a list of parts', () => {
    expect(answerText([{ type: 'text', text: 'The party ' }, { type: 'image_url', image_url: {} }, { type: 'text', text: 'won.' }])).toBe('The party won.');
    expect(answerText([{ text: ' Plain part ' }])).toBe('Plain part');
    expect(answerText(null)).toBe('');
    expect(interpretModelResponse(200, { choices: [{ message: { content: [{ type: 'text', text: 'A recap.' }] } }] }).text).toBe('A recap.');
  });

  it('says so when the model spent its allowance on thinking and wrote nothing', () => {
    const cutShort = () => interpretModelResponse(200, { choices: [{ finish_reason: 'length', message: { content: '' } }] });
    expect(cutShort).toThrow(/used up its allowance/);
    try { cutShort(); } catch (error) { expect(error.code).toBe('AI_ANSWER_CUT_SHORT'); }
    expect(() => interpretModelResponse(200, { choices: [{ finish_reason: 'stop', message: { content: '' } }] })).toThrow(/empty answer/);
  });

  it('tells a slow answer from a service that cannot be reached', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(modelCallFailure(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))).toMatchObject({ status: 504, code: 'AI_TIMEOUT' });
    expect(modelCallFailure(new TypeError('fetch failed'))).toMatchObject({ status: 502, code: 'AI_UNREACHABLE' });
    vi.restoreAllMocks();
  });
});
