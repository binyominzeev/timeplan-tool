import { useDroppable } from '@dnd-kit/core';
import type { Activity, DayKey, ScheduledEntry } from '../types';
import { ActivityCard } from './ActivityCard';
import {
  buildTimeRange,
  getActivityDurationMinutes,
  parseTimeToMinutes,
} from '../utils/time';

interface Props {
  day: DayKey;
  timeSlot: string;
  entries: ScheduledEntry[];
  activities: Activity[];
  onRemoveEntry: (entryId: string) => void;
  onShiftEntryLater: (entryId: string) => void;
}

export function CalendarSlot({
  day,
  timeSlot,
  entries,
  activities,
  onRemoveEntry,
  onShiftEntryLater,
}: Props) {
  const droppableId = `slot:${day}:${timeSlot}`;

  const { isOver, setNodeRef } = useDroppable({ id: droppableId });
  const sortedEntries = [...entries].sort((a, b) => {
    const aStart = a.startTime ?? a.timeSlot;
    const bStart = b.startTime ?? b.timeSlot;
    return parseTimeToMinutes(aStart) - parseTimeToMinutes(bStart);
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        'min-h-[60px] rounded-md border transition-all p-1 space-y-1',
        isOver
          ? 'border-blue-400 bg-blue-50'
          : 'border-dashed border-gray-200 bg-white hover:border-gray-300',
      ].join(' ')}
    >
      {sortedEntries.map((entry) => {
        const activity = activities.find((a) => a.id === entry.activityId);
        if (!activity) return null;
        const durationMinutes = getActivityDurationMinutes(activity);
        const fallbackRange = buildTimeRange(entry.timeSlot, durationMinutes);
        const startTime = entry.startTime ?? fallbackRange.startTime;
        const endTime = entry.endTime ?? fallbackRange.endTime;
        return (
          <ActivityCard
            key={entry.id}
            activity={activity}
            schedule={[]}
            inSlot
            slotEntryId={entry.id}
            onRemove={onRemoveEntry}
            onShiftLater={onShiftEntryLater}
            timeRangeLabel={`${startTime}–${endTime}`}
          />
        );
      })}
    </div>
  );
}
