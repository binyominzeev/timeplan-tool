import type { Activity, DayKey, ScheduledEntry } from '../types';

interface Props {
  activities: Activity[];
  schedule: ScheduledEntry[];
}

export function ProgressPanel({ activities, schedule }: Props) {
  if (activities.length === 0) return null;

  const withTarget = activities.filter((a) => (a.weeklyCount ?? 0) > 0);

  return (
    <div className="px-4 py-3 border-b border-gray-200 bg-white">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
        Weekly Progress
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {withTarget.map((activity) => {
          const scheduled = schedule.filter((e) => e.activityId === activity.id).length;
          const target = activity.weeklyCount!;
          const remaining = Math.max(0, target - scheduled);
          const pct = Math.min(100, (scheduled / target) * 100);
          const done = scheduled >= target;

          return (
            <div
              key={activity.id}
              className={`rounded-lg border px-2.5 py-2 text-xs ${
                done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <p className="font-semibold text-gray-700 truncate" title={activity.name}>
                {activity.name}
              </p>
              <div className="flex gap-2 text-gray-400 mt-0.5">
                <span>
                  {scheduled}/{target}
                </span>
                {remaining > 0 && (
                  <span className="text-orange-400">{remaining} left</span>
                )}
                {done && <span className="text-green-500">✓</span>}
              </div>
              <div className="mt-1 h-1 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full ${done ? 'bg-green-400' : 'bg-blue-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DayStatsProps {
  activities: Activity[];
  schedule: ScheduledEntry[];
}

export function DayStats({ activities, schedule }: DayStatsProps) {
  const days: { key: DayKey; label: string }[] = [
    { key: 'Mon', label: 'Mon' },
    { key: 'Tue', label: 'Tue' },
    { key: 'Wed', label: 'Wed' },
    { key: 'Thu', label: 'Thu' },
    { key: 'Fri', label: 'Fri' },
  ];

  return (
    <div className="flex gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50">
      {days.map(({ key, label }) => {
        const mins = schedule
          .filter((e) => e.day === key)
          .reduce((sum, e) => {
            const act = activities.find((a) => a.id === e.activityId);
            return sum + (act?.dailyMinutes ?? 0);
          }, 0);
        return (
          <div key={key} className="text-xs text-center">
            <p className="font-semibold text-gray-500">{label}</p>
            <p className="text-gray-400">{mins} min</p>
          </div>
        );
      })}
    </div>
  );
}
