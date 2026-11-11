import { currentUser } from '../auth.js';
import { readJson } from '../http.js';
import { enhanceItem } from '../lootEnhancer.js';
import { archiveStory, continueFromStory, listStories } from '../soloLibrary.js';
import {
  decideToolCall,
  generateStory,
  getNarratorConversation,
  narrateSolo,
  polishRecap,
  proposeMission,
  resetNarrator,
  resumeSolo,
  saveNarratorSummary,
  setNarrationGlossary,
  setNarrationLanguage,
  setNarratorMode,
} from '../soloNarrator.js';
import { signedIn } from './router.js';

const withBody = (work) => signedIn(async (user, { request }) => work(user, await readJson(request)));

// The same turn as POST /api/ai/solo-narrator, with the answer sent as it is written (server-sent events): 'delta'
// for text, 'tool' each time a tool call changes status, and a final 'done'. Problems found before the first word
// is written come back as an ordinary error response. 'resume' carries on a reply once the player has decided what
// it was waiting for.
function narratorStream(narrate) {
  return async ({ request, response }) => {
    const actor = await currentUser(request);
    const body = await readJson(request);
    const controller = new AbortController();
    response.on('close', () => controller.abort());
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
    };
    const emit = (event, data) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      const result = await narrate(actor, body, {
        signal: controller.signal,
        onDelta: (text) => { begin(); emit('delta', { text }); },
        onTool: (call) => { begin(); emit('tool', { id: call.id, name: call.name, label: call.label, status: call.status, summary: call.summary ?? null, error: call.error ?? null }); },
      });
      begin();
      emit('done', result);
      response.end();
    } catch (error) {
      if (!started) throw error;
      emit('error', { message: error instanceof Error ? error.message : 'The narrator stopped.', code: error?.code });
      response.end();
    }
  };
}

export const aiRoutes = [
  ['POST', '/api/ai/story', withBody(generateStory)],
  ['POST', '/api/ai/solo-mission', withBody(proposeMission)],
  ['GET', '/api/ai/solo-stories', signedIn((user, { query }) => listStories(user, query.get('partyId')))],
  ['POST', '/api/ai/solo-stories', withBody(archiveStory)],
  ['POST', '/api/ai/solo-stories/continue', withBody(continueFromStory)],
  ['POST', '/api/ai/loot-item', withBody(enhanceItem)],
  ['POST', '/api/ai/recap', withBody(polishRecap)],

  ['PUT', '/api/ai/solo-narrator/glossary', withBody(setNarrationGlossary)],
  ['PUT', '/api/ai/solo-narrator/mode', withBody(setNarratorMode)],
  ['POST', '/api/ai/solo-narrator/decide', withBody(decideToolCall)],
  ['PUT', '/api/ai/solo-narrator/language', withBody(setNarrationLanguage)],
  ['GET', '/api/ai/solo-narrator', signedIn((user, { query }) => getNarratorConversation(user, query.get('partyId')))],
  ['DELETE', '/api/ai/solo-narrator', signedIn((user, { query }) => resetNarrator(user, query.get('partyId')))],
  ['PUT', '/api/ai/solo-narrator', withBody(saveNarratorSummary)],
  ['POST', '/api/ai/solo-narrator', withBody((user, body) => narrateSolo(user, body))],
  ['POST', '/api/ai/solo-narrator/stream', narratorStream(narrateSolo)],
  ['POST', '/api/ai/solo-narrator/resume', narratorStream(resumeSolo)],
];
