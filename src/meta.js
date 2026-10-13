// Persistent progression between runs (localStorage, with safe fallbacks).

const KEY = 'nyoomies.meta.v1';

const DEFAULT = {
  data: 0,
  unlocked: ['cycle', 'pod'],
  runs: 0,
  wins: 0,
  bestSector: 0,
  totalDerezzes: 0,
};

export function loadMeta() {
  const meta = { ...DEFAULT, unlocked: [...DEFAULT.unlocked] };
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved === 'object') {
      // Take only well-formed fields so a corrupted or hand-edited save
      // can't break the title screen.
      for (const k of ['data', 'runs', 'wins', 'bestSector', 'totalDerezzes']) {
        if (Number.isFinite(saved[k]) && saved[k] >= 0) meta[k] = Math.floor(saved[k]);
      }
      if (Array.isArray(saved.unlocked)) {
        meta.unlocked = [...new Set([...DEFAULT.unlocked, ...saved.unlocked.filter((id) => typeof id === 'string')])];
      }
    }
  } catch {
    // Storage unavailable (private mode, blocked cookies) or corrupt: start fresh.
  }
  return meta;
}

export function saveMeta(meta) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(meta));
  } catch {
    // Ignore: progression just won't persist.
  }
}

export function recordRun(meta, run) {
  const earned = run.dataEarned();
  meta.data += earned;
  meta.runs++;
  if (run.won) meta.wins++;
  meta.bestSector = Math.max(meta.bestSector, run.sector + (run.won ? 1 : 0));
  meta.totalDerezzes += run.stats.derezzes;
  saveMeta(meta);
  return earned;
}

export function unlock(meta, chassis) {
  if (meta.unlocked.includes(chassis.id) || meta.data < chassis.cost) return false;
  meta.data -= chassis.cost;
  meta.unlocked.push(chassis.id);
  saveMeta(meta);
  return true;
}
