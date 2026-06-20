import type { Activity } from '../types';

/**
 * Parse a CSV exported from the Hungarian time-planning spreadsheet.
 *
 * Expected columns (row 1 is a header):
 *   A: Tevékenység
 *   B: Napi (perc)
 *   C: Heti (óra)
 *   D: Heti alkalmak
 *   E: Megjegyzés
 *
 * Rows where columns B-D are all empty are treated as category headers.
 */
export function parseCSV(csvText: string): Activity[] {
  const lines = csvText.split(/\r?\n/);
  const activities: Activity[] = [];
  let currentCategory = '';
  let headerSkipped = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Parse CSV columns (handles quoted fields)
    const cols = parseCSVLine(trimmed);
    const name = cols[0]?.trim() ?? '';
    if (!name) continue;

    // Skip the header row
    if (!headerSkipped) {
      headerSkipped = true;
      // If this looks like a data row already (unlikely for first row) we fall through
      if (name === 'Tevékenység') continue;
    }

    const colB = cols[1]?.trim() ?? '';
    const colC = cols[2]?.trim() ?? '';
    const colD = cols[3]?.trim() ?? '';
    const colE = cols[4]?.trim() ?? '';

    const allEmpty = !colB && !colC && !colD;

    if (allEmpty) {
      // Category header row
      currentCategory = name;
      continue;
    }

    const dailyMinutes = colB ? parseFloat(colB) : null;
    const weeklyHours = colC ? parseFloat(colC) : null;
    const weeklyCount = colD ? parseFloat(colD) : null;

    activities.push({
      id: crypto.randomUUID(),
      name,
      category: currentCategory,
      dailyMinutes: dailyMinutes !== null && isNaN(dailyMinutes) ? null : dailyMinutes,
      weeklyHours: weeklyHours !== null && isNaN(weeklyHours) ? null : weeklyHours,
      weeklyCount: weeklyCount !== null && isNaN(weeklyCount) ? null : weeklyCount,
      notes: colE,
    });
  }

  return activities;
}

/** Minimal RFC-4180 CSV line parser */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
