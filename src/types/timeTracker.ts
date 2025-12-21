export type TimeMarker = 'X' | 'R' | 'S' | 'T' | 'L' | null;

export interface HourState {
  stretches: [TimeMarker, TimeMarker, TimeMarker, TimeMarker]; // 4 stretches per hour
  notes: string;
}

// Key is string "1" through "24"
export interface TimeTrackerGrid {
  [key: string]: HourState;
}

export interface TimeTracker {
  id: string;
  party_id: string;
  current_day: number;
  current_shift: number;
  grid_state: TimeTrackerGrid;
} 