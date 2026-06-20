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
