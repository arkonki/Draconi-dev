import type { Translator } from '../../i18n/translate';
import type { NarratorConversation, NarratorToolCall } from '../../lib/api/ai';

const text = (value: unknown, length = 80): string => {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
};

/** One thing the narrator did or wants to do, in a few words and in the screen's language. */
export function toolTitle(call: Pick<NarratorToolCall, 'name' | 'args' | 'label'>, t: Translator): string {
  const args = call.args ?? {};
  switch (call.name) {
    case 'get_game_state': return t('Read the game state');
    case 'roll_check': {
      const name = text(args.check_name, 40);
      if (args.modifier === 'boon') return t('Roll {name} with a boon', { name });
      if (args.modifier === 'bane') return t('Roll {name} with a bane', { name });
      return t('Roll {name}', { name });
    }
    case 'ask_fortune': return t('Ask Fortune: {text}', { text: text(args.question) });
    case 'draw_inspiration': return t('Draw inspiration');
    case 'push_check': return t('Push the failed roll');
    case 'settle_failed_check': return t('Take a consequence: {text}', { text: text(args.description, 100) });
    case 'narrative_damage': return t('Take damage: {text}', { text: text(args.context) });
    case 'take_rest':
      return args.rest_type === 'shift' ? t('Take a shift rest') : args.rest_type === 'stretch' ? t('Take a stretch rest') : t('Take a round rest');
    case 'search_place': return args.context ? t('Search: {text}', { text: text(args.context) }) : t('Search the place');
    case 'scavenge_place': return args.context ? t('Scavenge: {text}', { text: text(args.context) }) : t('Scavenge the place');
    case 'create_creature': return t('Bring in {name}', { name: text(args.name, 60) });
    case 'creature_behavior': return t('{name} acts: {behavior}', { name: text(args.creature, 60), behavior: text(args.behavior, 20) });
    case 'reveal_place': return args.title ? t('Move on to {place}', { place: text(args.title, 60) }) : t('Move on');
    case 'add_places': return t('Add {count} places to the route', { count: Number(args.count) || 1 });
    case 'leave_site': return t('Leave the site');
    case 'advance_threat': return t('Advance the threat: {text}', { text: text(args.why) });
    case 'resolve_threat': return t('Resolve the threat: {text}', { text: text(args.resolution) });
    case 'set_threat': return t('A new threat: {text}', { text: text(args.description) });
    case 'dying_action': return t('Fight to live');
    case 'treat_injury': return t('Treat the injury: {name}', { name: text(args.injury, 60) });
    case 'advance_time': return t('Let time pass: {amount} {unit}', { amount: Number(args.amount) || 1, unit: text(args.unit, 10) });
    case 'update_scene': return t('Update the scene: {place}', { place: text(args.location, 60) });
    default: return call.label;
  }
}

/** How many things the narrator is waiting for the player to approve. */
export function awaitingApprovals(conversation: NarratorConversation | undefined): number {
  return (conversation?.turns ?? []).reduce((total, turn) => total + (turn.toolCalls ?? []).filter((call) => call.status === 'pending').length, 0);
}

