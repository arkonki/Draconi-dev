// Lines the session recap draft writes for the GM, not about the game. They are taken out before the draft goes to
// the AI, so a polished recap never repeats them.
export const RECAP_NOTHING_RECORDED = 'Nothing was recorded by the app this session. Write what happened here.';
export const RECAP_DRAFT_NOTE = '(Draft from what the app recorded. Add what really happened before you end the session.)';

const NOTES = new Set([RECAP_NOTHING_RECORDED, RECAP_DRAFT_NOTE]);

/** The recap text without the GM-only lines, with the blank lines they leave behind tidied up. */
export function stripRecapNotes(text) {
  return String(text ?? '')
    .split('\n')
    .filter((line) => !NOTES.has(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
