export interface Activity {
  id: string;
  name: string;
  category: string;
  dailyMinutes: number | null;
  weeklyHours: number | null;
  weeklyCount: number | null;
  notes: string;
}

export type DayKey = string;

export const DEFAULT_DAYS: DayKey[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const DEFAULT_DAY_LABELS: Record<DayKey, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
};

export interface ScheduledEntry {
  /** Unique id of this slot instance */
  id: string;
  activityId: string;
  day: DayKey;
  timeSlot: string;
  startTime?: string;
  endTime?: string;
}

export interface AppState {
  activities: Activity[];
  schedule: ScheduledEntry[];
  days: DayKey[];
  dayLabels: Record<DayKey, string>;
}
