// The Solo story is one shared record, whoever plays: through the built-in narrator or through an AI assistant
// connected over MCP. Both read the same things from Draconi (the latest checkpoint, session summaries, open threads,
// the scene and the event log), and the narrator's running summary and recent exchanges are published back through the
// Solo state and the resume state, so an assistant that connects later picks up exactly where the narrator left off.

const EXCHANGES_PUBLISHED = 4;
const EXCHANGE_CHARS = 400;

const clip = (value, length) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};

/** The narrator's story so far and its latest exchanges, in the form other clients receive. */
export async function loadPublishedStory(client, campaignId) {
  const [{ rows: memory }, { rows: turns }] = await Promise.all([
    client.query('SELECT summary, updated_at FROM solo_narrator_memory WHERE party_id = $1', [campaignId]),
    client.query(
      `SELECT role, content, created_at FROM solo_narrator_turns
       WHERE party_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [campaignId, EXCHANGES_PUBLISHED],
    ),
  ]);
  const summary = memory[0]?.summary ?? '';
  if (!summary && turns.length === 0) return null;
  return {
    storySoFar: summary,
    storyUpdatedAt: memory[0]?.updated_at ?? null,
    recentExchanges: turns.reverse().map((turn) => ({ role: turn.role === 'user' ? 'player' : 'narrator', text: clip(turn.content, EXCHANGE_CHARS), at: turn.created_at })),
  };
}
