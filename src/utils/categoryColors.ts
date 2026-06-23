const CATEGORY_PALETTE = [
  {
    badge: 'bg-sky-100 text-sky-800 border-sky-200',
    event: 'border-sky-300 bg-sky-100 text-sky-900',
    accent: 'text-sky-700',
    eventStyle: {
      background: '#e0f2fe',
      border: '#7dd3fc',
      text: '#0c4a6e',
      accent: '#0369a1',
    },
  },
  {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    event: 'border-emerald-300 bg-emerald-100 text-emerald-900',
    accent: 'text-emerald-700',
    eventStyle: {
      background: '#dcfce7',
      border: '#86efac',
      text: '#14532d',
      accent: '#15803d',
    },
  },
  {
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    event: 'border-amber-300 bg-amber-100 text-amber-900',
    accent: 'text-amber-700',
    eventStyle: {
      background: '#fef3c7',
      border: '#fcd34d',
      text: '#78350f',
      accent: '#b45309',
    },
  },
  {
    badge: 'bg-rose-100 text-rose-800 border-rose-200',
    event: 'border-rose-300 bg-rose-100 text-rose-900',
    accent: 'text-rose-700',
    eventStyle: {
      background: '#ffe4e6',
      border: '#fda4af',
      text: '#881337',
      accent: '#be123c',
    },
  },
  {
    badge: 'bg-violet-100 text-violet-800 border-violet-200',
    event: 'border-violet-300 bg-violet-100 text-violet-900',
    accent: 'text-violet-700',
    eventStyle: {
      background: '#f3e8ff',
      border: '#c4b5fd',
      text: '#4c1d95',
      accent: '#6d28d9',
    },
  },
  {
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    event: 'border-orange-300 bg-orange-100 text-orange-900',
    accent: 'text-orange-700',
    eventStyle: {
      background: '#ffedd5',
      border: '#fdba74',
      text: '#7c2d12',
      accent: '#c2410c',
    },
  },
];

function hashCategory(category: string): number {
  let hash = 0;
  for (const char of category) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function getCategoryColorSet(category: string) {
  const normalized = category.trim().toLowerCase();
  if (!normalized) {
    return {
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
      event: 'border-slate-300 bg-slate-100 text-slate-900',
      accent: 'text-slate-700',
      eventStyle: {
        background: '#f1f5f9',
        border: '#cbd5e1',
        text: '#0f172a',
        accent: '#334155',
      },
    };
  }

  return CATEGORY_PALETTE[hashCategory(normalized) % CATEGORY_PALETTE.length];
}