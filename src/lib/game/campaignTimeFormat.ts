const DAY_SECONDS = 24 * 60 * 60;

function shiftForHour(hour: number): CampaignClockLabel['shift'] {
  if (hour <= 6) return 'Morning';
  if (hour <= 12) return 'Day';
  if (hour <= 18) return 'Evening';
  return 'Night';
}

export interface CampaignClockLabel {
  day: number;
  shift: 'Morning' | 'Day' | 'Evening' | 'Night';
  time: string;
}

export function formatCampaignClock(elapsedSeconds: number): CampaignClockLabel {
  const safeElapsedSeconds = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));
  const elapsedDays = Math.floor(safeElapsedSeconds / DAY_SECONDS);
  const secondsToday = safeElapsedSeconds % DAY_SECONDS;
  const hour = Math.floor(secondsToday / 3600);
  const minute = Math.floor((secondsToday % 3600) / 60);
  const shift = shiftForHour(hour);
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return {
    day: elapsedDays + 1,
    shift,
    time,
  };
}
