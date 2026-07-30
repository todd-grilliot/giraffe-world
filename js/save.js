// Progress lives in localStorage, so she can close the tab and come back.

const KEY = 'giraffe-world/v1';

const EMPTY = { found: [], sparks: [], spawn: null, unlocked: false, finaleSeen: false };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const data = JSON.parse(raw);
    return {
      found:      Array.isArray(data.found)  ? data.found  : [],
      sparks:     Array.isArray(data.sparks) ? data.sparks : [],
      spawn:      data.spawn || null,
      unlocked:   !!data.unlocked,
      finaleSeen: !!data.finaleSeen,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch {}
}
