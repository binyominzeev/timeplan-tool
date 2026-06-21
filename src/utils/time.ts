import type { Activity } from '../types';

const DEFAULT_ACTIVITY_DURATION_MINUTES = 60;

export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getActivityDurationMinutes(activity?: Activity): number {
  const minutes = activity?.dailyMinutes;
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_ACTIVITY_DURATION_MINUTES;
  }
  return Math.round(minutes);
}

export function buildTimeRange(startTime: string, durationMinutes: number): {
  startTime: string;
  endTime: string;
} {
  const startMinutes = parseTimeToMinutes(startTime);
  return {
    startTime,
    endTime: minutesToTime(startMinutes + durationMinutes),
  };
}

// Default fillable windows (can be made configurable later)
export const DEFAULT_FILL_WINDOWS: { start: string; end: string }[] = [
  { start: '10:00', end: '12:00' },
  { start: '15:00', end: '17:30' },
];

export function totalWindowsMinutes(windows: { start: string; end: string }[]): number {
  return windows.reduce((sum, w) => sum + (parseTimeToMinutes(w.end) - parseTimeToMinutes(w.start)), 0);
}

export function minutesToHoursString(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours > 0 && rem > 0) return `${hours} óra ${rem} perc`;
  if (hours > 0) return `${hours} óra`;
  return `${rem} perc`;
}
