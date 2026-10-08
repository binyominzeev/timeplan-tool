import { useEffect } from 'react';
import type { CompletionRecord } from '../types';

interface Props {
  completions: CompletionRecord[];
  onClose: () => void;
}

function formatDay(date: string): string {
  return new Intl.DateTimeFormat('hu-HU', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

export function CompletionLogDialog({ completions, onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const sortedCompletions = [...completions].sort((a, b) =>
    b.date.localeCompare(a.date) || b.completedAt.localeCompare(a.completedAt),
  );
  const groupedCompletions = sortedCompletions.reduce<Array<{ date: string; records: CompletionRecord[] }>>(
    (groups, completion) => {
      const latestGroup = groups[groups.length - 1];
      if (latestGroup?.date === completion.date) {
        latestGroup.records.push(completion);
      } else {
        groups.push({ date: completion.date, records: [completion] });
      }
      return groups;
    },
    [],
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/35 px-4 py-8 print:hidden">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Napló bezárása"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-log-title"
        className="relative flex max-h-[min(80vh,48rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 id="completion-log-title" className="text-base font-semibold text-gray-900">
              Mit csináltam már meg?
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">Elvégzett feladatok</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label="Bezárás"
            title="Bezárás"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {groupedCompletions.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">Még nincs kipipált feladat.</p>
          ) : (
            groupedCompletions.map((group) => (
              <section key={group.date} className="border-b border-gray-200 py-4 last:border-b-0">
                <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  {formatDay(group.date)}
                </h3>
                <ul className="divide-y divide-gray-100">
                  {group.records.map((completion) => (
                    <li key={`${completion.date}:${completion.entryId}`} className="flex items-start gap-3 py-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-gray-800">{completion.activityName}</p>
                        {completion.category && <p className="mt-0.5 text-xs text-gray-500">{completion.category}</p>}
                      </div>
                      <time className="shrink-0 pt-0.5 text-xs tabular-nums text-gray-500">
                        {completion.startTime}-{completion.endTime}
                      </time>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </section>
    </div>
  );
}