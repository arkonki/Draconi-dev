import type { CombatSummary } from './combatSummary';
import { RECAP_DRAFT_NOTE, RECAP_NOTHING_RECORDED } from '../../shared/recapNotes.js';

// A first draft of the session summary, assembled from what the app already recorded while the session ran:
// fights, notable rolls, quests and chat. It is plain text for the GM to rewrite, not a finished story.

export interface RecapFight {
  name: string;
  rounds: number;
  summary: CombatSummary;
}

export interface RecapInput {
  title: string;
  startedAt: string | null;
  endedAt: Date;
  /** The game clock now, already formatted, or null when unknown. */
  clock: string | null;
  fights: RecapFight[];
  /** Purposes of the rolls that came up a dragon or a demon. */
  dragons: string[];
  demons: string[];
  questsCompleted: string[];
  questsAdded: string[];
  messageCount: number;
  /** What happened in the story this session, such as the solo narrator's replies. Empty when not known. */
  story?: string;
}

const STORY_LIMIT = 3000;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const list = (names: string[]) => names.join(', ');

/** "3 h 20 min", or "45 min"; empty when the start is not known. */
export function formatDuration(startedAt: string | null, endedAt: Date): string {
  if (!startedAt) return '';
  const minutes = Math.round((endedAt.getTime() - new Date(startedAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

export function fightLine(fight: RecapFight): string {
  const { summary } = fight;
  const parts = [`${fight.name}: ${plural(fight.rounds, 'round')}.`];
  if (summary.defeated.length) parts.push(`Defeated ${list(summary.defeated)}.`);
  if (summary.wentDown.length) parts.push(`Went down: ${list(summary.wentDown)}${summary.died.length ? ` (died: ${list(summary.died)})` : ''}.`);
  parts.push(`${summary.damageToMonsters} damage to the enemies, ${summary.damageToPlayers} to the party.`);
  return parts.join(' ');
}

export function buildSessionRecap(input: RecapInput): string {
  const lines: string[] = [];
  const duration = formatDuration(input.startedAt, input.endedAt);
  lines.push(`${input.title}${duration ? `, played for ${duration}` : ''}.`);
  if (input.clock) lines.push(`The game clock now reads ${input.clock}.`);

  if (input.fights.length > 0) {
    lines.push('', input.fights.length === 1 ? 'Fight' : 'Fights');
    for (const fight of input.fights) lines.push(`• ${fightLine(fight)}`);
  }

  if (input.dragons.length + input.demons.length > 0) {
    lines.push('', 'Notable rolls');
    if (input.dragons.length) lines.push(`• ${plural(input.dragons.length, 'dragon')}: ${list(input.dragons.slice(0, 5))}${input.dragons.length > 5 ? ', …' : ''}`);
    if (input.demons.length) lines.push(`• ${plural(input.demons.length, 'demon')}: ${list(input.demons.slice(0, 5))}${input.demons.length > 5 ? ', …' : ''}`);
  }

  if (input.questsCompleted.length + input.questsAdded.length > 0) {
    lines.push('', 'Quests');
    if (input.questsCompleted.length) lines.push(`• Completed: ${list(input.questsCompleted)}`);
    if (input.questsAdded.length) lines.push(`• New: ${list(input.questsAdded)}`);
  }

  if (input.messageCount > 0) lines.push('', `${plural(input.messageCount, 'chat message')} at the table.`);

  const story = (input.story ?? '').trim();
  if (story) lines.push('', 'Story', story.length > STORY_LIMIT ? `…${story.slice(-(STORY_LIMIT - 1))}` : story);

  if (lines.length <= 2) lines.push('', RECAP_NOTHING_RECORDED);
  lines.push('', RECAP_DRAFT_NOTE);
  return lines.join('\n');
}
