import { describe, expect, it } from 'vitest';
import { readEventStream } from './api/ai';
import { visibleNarration } from './narratorText';

const streamOf = (chunks: string[]) => new ReadableStream<Uint8Array>({
  start(controller) {
    const encoder = new TextEncoder();
    for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
    controller.close();
  },
});

describe('narrator text', () => {
  it('hides the actions line, even while it is still being written', () => {
    expect(visibleNarration('The bridge sways.\n1. Cross\nACTIONS: [{"ty')).toBe('The bridge sways.\n1. Cross');
    expect(visibleNarration('Just a story.')).toBe('Just a story.');
    expect(visibleNarration('')).toBe('');
  });
});

describe('event stream reader', () => {
  it('reads events however the bytes are cut up', async () => {
    const events: Array<[string, unknown]> = [];
    const text = 'event: delta\ndata: {"text":"The "}\n\nevent: delta\ndata: {"text":"door."}\n\nevent: done\ndata: {"id":"a"}\n\n';
    const pieces = text.match(/[\s\S]{1,9}/g) ?? [];
    await readEventStream(streamOf(pieces), (event, data) => events.push([event, data]));
    expect(events).toEqual([['delta', { text: 'The ' }], ['delta', { text: 'door.' }], ['done', { id: 'a' }]]);
  });

  it('reads a last event that has no blank line after it, and skips damaged ones', async () => {
    const events: Array<[string, unknown]> = [];
    await readEventStream(streamOf(['event: delta\ndata: {broken\n\nevent: done\ndata: {"ok":true}']), (event, data) => events.push([event, data]));
    expect(events).toEqual([['done', { ok: true }]]);
  });
});
