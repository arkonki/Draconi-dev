import { appendMessageIfMissing, type Message } from './chat';

const message: Message = {
  id: 'message-1',
  party_id: 'party-1',
  user_id: 'user-1',
  content: 'Hello',
  created_at: '2026-07-24T00:00:00.000Z',
};

describe('appendMessageIfMissing', () => {
  it('appends a newly received message', () => {
    expect(appendMessageIfMissing([], message)).toEqual([message]);
  });

  it('does not append a message already delivered by realtime', () => {
    const messages = [message];
    expect(appendMessageIfMissing(messages, { ...message })).toBe(messages);
  });
});
