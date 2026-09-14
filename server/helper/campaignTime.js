const STRETCH_SECONDS = 15 * 60;
const STRETCHES_PER_HOUR = 4;
const DAY_SECONDS = 24 * 60 * 60;

export function elapsedSecondsFromLegacyTimeTracker(tracker) {
  if (!tracker || typeof tracker !== 'object' || Array.isArray(tracker)) return 0;

  const currentDay = Math.max(1, Math.floor(Number(tracker.current_day) || 1));
  const grid = tracker.grid_state && typeof tracker.grid_state === 'object' && !Array.isArray(tracker.grid_state)
    ? tracker.grid_state
    : {};
  let completedStretches = 0;

  for (let hour = 1; hour <= 24; hour += 1) {
    const stretches = Array.isArray(grid[String(hour)]?.stretches)
      ? grid[String(hour)].stretches
      : [];
    stretches.slice(0, STRETCHES_PER_HOUR).forEach((marker, index) => {
      if (marker !== null && marker !== undefined) {
        completedStretches = Math.max(completedStretches, ((hour - 1) * STRETCHES_PER_HOUR) + index + 1);
      }
    });
  }

  return ((currentDay - 1) * DAY_SECONDS) + (completedStretches * STRETCH_SECONDS);
}
