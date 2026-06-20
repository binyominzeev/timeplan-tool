import type { Activity, ScheduledEntry } from '../types';
import { ActivityCard } from './ActivityCard';

interface Props {
  activities: Activity[];
  schedule: ScheduledEntry[];
  onImportClick: () => void;
}

export function Backlog({ activities, schedule, onImportClick }: Props) {
  // Group activities by category
  const categories = Array.from(new Set(activities.map((a) => a.category)));

  const unscheduledActivities = activities.filter((a) => {
    const scheduled = schedule.filter((e) => e.activityId === a.id).length;
    const target = a.weeklyCount ?? 0;
    return scheduled < target || target === 0;
  });

  return (
    <aside className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-base font-bold text-gray-700">Activities</h2>
        <button
          onClick={onImportClick}
          className="flex items-center gap-1 text-xs bg-blue-500 hover:bg-blue-600 text-white px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
        >
          <span>↑</span> Import CSV
        </button>
      </div>

      {activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-400 text-sm px-4 text-center gap-2 py-8">
          <span className="text-3xl">📋</span>
          <p>No activities yet.</p>
          <p>Import a CSV to get started.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {/* Summary */}
          <div className="text-xs text-gray-400 flex gap-2">
            <span>{activities.length} activities</span>
            <span>·</span>
            <span>{unscheduledActivities.length} not fully scheduled</span>
          </div>

          {categories.map((cat) => {
            const group = activities.filter((a) => a.category === cat);
            return (
              <div key={cat}>
                {cat && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5 px-0.5">
                    {cat}
                  </p>
                )}
                <div className="space-y-2">
                  {group.map((activity) => (
                    <ActivityCard
                      key={activity.id}
                      activity={activity}
                      schedule={schedule}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
