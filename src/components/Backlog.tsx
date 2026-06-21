import { useMemo, useState, type FormEvent } from 'react';
import type { Activity, ScheduledEntry } from '../types';
import { ActivityCard } from './ActivityCard';

type ActivityInput = Omit<Activity, 'id'>;

interface Props {
  activities: Activity[];
  schedule: ScheduledEntry[];
  onAddActivity: (activity: ActivityInput) => void;
  onUpdateActivity: (activityId: string, activity: ActivityInput) => void;
}

interface FormState {
  name: string;
  category: string;
  dailyMinutes: string;
  weeklyHours: string;
  weeklyCount: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  category: '',
  dailyMinutes: '',
  weeklyHours: '',
  weeklyCount: '',
  notes: '',
};

function toFormState(activity: Activity): FormState {
  return {
    name: activity.name,
    category: activity.category,
    dailyMinutes: activity.dailyMinutes?.toString() ?? '',
    weeklyHours: activity.weeklyHours?.toString() ?? '',
    weeklyCount: activity.weeklyCount?.toString() ?? '',
    notes: activity.notes,
  };
}

function parseOptionalNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function Backlog({
  activities,
  schedule,
  onAddActivity,
  onUpdateActivity,
}: Props) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Group activities by category
  const categories = useMemo(() => Array.from(new Set(activities.map((a) => a.category))), [activities]);

  const unscheduledActivities = activities.filter((a) => {
    const scheduled = schedule.filter((e) => e.activityId === a.id).length;
    const target = a.weeklyCount ?? 0;
    return scheduled < target || target === 0;
  });

  const editingActivity = editingActivityId
    ? activities.find((activity) => activity.id === editingActivityId)
    : undefined;
  const isEditMode = Boolean(editingActivity);

  const openAddDialog = () => {
    setEditingActivityId(null);
    setForm(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const openEditDialog = (activity: Activity) => {
    setEditingActivityId(activity.id);
    setForm(toFormState(activity));
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingActivityId(null);
    setForm(EMPTY_FORM);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = form.name.trim();
    if (!name) {
      alert('Name is required.');
      return;
    }

    const payload: ActivityInput = {
      name,
      category: form.category.trim(),
      dailyMinutes: parseOptionalNumber(form.dailyMinutes),
      weeklyHours: parseOptionalNumber(form.weeklyHours),
      weeklyCount: parseOptionalNumber(form.weeklyCount),
      notes: form.notes.trim(),
    };

    if (editingActivityId) {
      onUpdateActivity(editingActivityId, payload);
    } else {
      onAddActivity(payload);
    }

    closeDialog();
  };

  return (
    <aside className="relative flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-base font-bold text-gray-700">Activities</h2>
        <button
          onClick={openAddDialog}
          className="flex items-center gap-1 text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-md transition-colors cursor-pointer"
        >
          <span>+</span> Add
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
                      onEdit={() => openEditDialog(activity)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isDialogOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-gray-900/30 px-3">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">
                {isEditMode ? 'Edit Activity' : 'Add Activity'}
              </h3>
              <button
                onClick={closeDialog}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-4 py-3 space-y-3">
              <label className="block text-xs text-gray-600">
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                  placeholder="e.g. Deep work"
                  required
                />
              </label>

              <label className="block text-xs text-gray-600">
                Category
                <input
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                  placeholder="e.g. Work"
                />
              </label>

              <div className="grid grid-cols-3 gap-2">
                <label className="block text-xs text-gray-600">
                  Min/day
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.dailyMinutes}
                    onChange={(e) => setForm((prev) => ({ ...prev, dailyMinutes: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                    placeholder="0"
                  />
                </label>

                <label className="block text-xs text-gray-600">
                  H/week
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={form.weeklyHours}
                    onChange={(e) => setForm((prev) => ({ ...prev, weeklyHours: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                    placeholder="0"
                  />
                </label>

                <label className="block text-xs text-gray-600">
                  Count/week
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.weeklyCount}
                    onChange={(e) => setForm((prev) => ({ ...prev, weeklyCount: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
                    placeholder="0"
                  />
                </label>
              </div>

              <label className="block text-xs text-gray-600">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                  rows={3}
                  placeholder="Optional notes"
                />
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeDialog}
                  className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="text-xs px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white cursor-pointer"
                >
                  {isEditMode ? 'Save Changes' : 'Create Activity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
