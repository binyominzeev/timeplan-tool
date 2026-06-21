import { useDraggable } from '@dnd-kit/core';
import type { Activity, ScheduledEntry } from '../types';

interface Props {
  activity: Activity;
  schedule: ScheduledEntry[];
  /** When true the card is shown inside a calendar slot */
  inSlot?: boolean;
  slotEntryId?: string;
  onRemove?: (entryId: string) => void;
  onEdit?: () => void;
  timeRangeLabel?: string;
}

export function ActivityCard({
  activity,
  schedule,
  inSlot = false,
  slotEntryId,
  onRemove,
  onEdit,
  timeRangeLabel,
}: Props) {
  const draggableId = inSlot && slotEntryId ? `slot:${slotEntryId}` : `activity:${activity.id}`;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: draggableId,
    data: { activityId: activity.id, slotEntryId: inSlot ? slotEntryId : undefined },
  });

  const scheduled = schedule.filter((e) => e.activityId === activity.id).length;
  const target = activity.weeklyCount ?? 0;
  const remaining = Math.max(0, target - scheduled);

  const progressPct = target > 0 ? Math.min(100, (scheduled / target) * 100) : 0;
  const isComplete = target > 0 && scheduled >= target;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={[
        'group relative bg-white border rounded-lg p-2.5 cursor-grab shadow-sm select-none',
        'transition-all duration-150',
        isDragging ? 'opacity-40 shadow-lg scale-105' : 'hover:shadow-md hover:border-blue-300',
        isComplete ? 'border-green-300 bg-green-50' : 'border-gray-200',
        inSlot ? 'text-xs' : 'text-sm',
      ].join(' ')}
    >
      {/* Remove button (only in slot) */}
      {inSlot && onRemove && slotEntryId && (
        <button
          className="absolute top-1 right-1 text-gray-300 hover:text-red-400 leading-none z-10 cursor-pointer print:hidden"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(slotEntryId);
          }}
          title="Remove"
        >
          ×
        </button>
      )}

      {!inSlot && onEdit && (
        <button
          className="absolute top-1 right-1 text-gray-300 hover:text-blue-500 leading-none z-10 cursor-pointer print:hidden"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="Edit activity"
        >
          ✎
        </button>
      )}

      <p className={`font-semibold leading-tight text-gray-800 ${inSlot ? 'pr-3' : ''}`}>
        {activity.name}
      </p>

      <div className="flex items-center gap-2 mt-1 text-gray-500">
        {inSlot && timeRangeLabel && (
          <span className="whitespace-nowrap font-medium text-blue-600">{timeRangeLabel}</span>
        )}
        {!inSlot && activity.dailyMinutes != null && (
          <span className="whitespace-nowrap print:hidden">{activity.dailyMinutes} min</span>
        )}
        {!inSlot && activity.weeklyCount != null && (
          <span className="whitespace-nowrap print:hidden">{activity.weeklyCount}×/week</span>
        )}
      </div>

      {!inSlot && activity.weeklyHours != null && (
        <p className="text-gray-400 mt-0.5 print:hidden">{activity.weeklyHours}h/week</p>
      )}

      {!inSlot && target > 0 && (
        <div className="mt-2 print:hidden">
          <div className="flex justify-between text-xs text-gray-400 mb-0.5">
            <span>{scheduled}/{target} scheduled</span>
            {remaining > 0 && <span className="text-orange-400">{remaining} left</span>}
            {isComplete && <span className="text-green-500">✓ done</span>}
          </div>
          <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-400' : 'bg-blue-400'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
