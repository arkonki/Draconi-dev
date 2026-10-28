import { supabase } from '../supabase';
import { buildCombatSummary, type SummaryLogEntry } from '../combatSummary';
import { buildSessionRecap, type RecapFight } from '../sessionRecap';
import { fetchEncounterCombatants } from './encounters';
import { fetchTasks } from './tasks';
import { fetchTrustedRollHistory } from './trustedRolls';
import type { Encounter } from '../../types/encounter';

/**
 * Collects what happened since the session started and returns a draft summary. Each source is looked up on its
 * own, so one that fails (or that the person may not read) only leaves its part out of the draft.
 */
export async function draftSessionRecap(
  partyId: string,
  session: { title: string; startedAt?: string | null },
  clock: string | null,
  extra: { story?: string } = {},
): Promise<string> {
  // Without a start time nothing can be placed in this session, so leave the recorded facts out rather than
  // reporting the whole campaign's history as this session's.
  const since = session.startedAt ? new Date(session.startedAt).getTime() : null;
  const after = (value: string | null | undefined) => since !== null && Boolean(value) && new Date(value as string).getTime() > since;

  const [encounters, rolls, tasks, messages] = await Promise.allSettled([
    (async () => {
      const { data, error } = await supabase.from('encounters').select('*').eq('party_id', partyId).eq('status', 'completed');
      if (error) throw error;
      const finished = ((data ?? []) as Encounter[]).filter((encounter) => after(encounter.updated_at));
      return Promise.all(finished.map(async (encounter): Promise<RecapFight> => {
        const combatants = await fetchEncounterCombatants(encounter.id);
        return { name: encounter.name, rounds: encounter.current_round, summary: buildCombatSummary((encounter.log ?? []) as SummaryLogEntry[], combatants, encounter.current_round) };
      }));
    })(),
    fetchTrustedRollHistory(partyId, { limit: 200 }),
    fetchTasks(partyId),
    (async () => {
      if (!session.startedAt) return 0;
      const { data, error } = await supabase.from('messages').select('id').eq('party_id', partyId).gt('created_at', session.startedAt);
      if (error) throw error;
      return data?.length ?? 0;
    })(),
  ]);

  const dragons: string[] = [];
  const demons: string[] = [];
  if (rolls.status === 'fulfilled') {
    for (const request of rolls.value.requests) {
      if (!request.result || !after(request.result.createdAt)) continue;
      const outcome = request.result.roll.result.outcome;
      if (outcome === 'dragon') dragons.push(request.purpose);
      if (outcome === 'demon') demons.push(request.purpose);
    }
  }
  const taskList = tasks.status === 'fulfilled' ? tasks.value : [];

  return buildSessionRecap({
    title: session.title,
    startedAt: session.startedAt ?? null,
    endedAt: new Date(),
    clock,
    fights: encounters.status === 'fulfilled' ? encounters.value : [],
    dragons,
    demons,
    questsCompleted: taskList.filter((task) => task.status === 'completed' && after(task.completed_at)).map((task) => task.title),
    questsAdded: taskList.filter((task) => after(task.created_at)).map((task) => task.title),
    messageCount: messages.status === 'fulfilled' ? messages.value : 0,
    story: extra.story,
  });
}
