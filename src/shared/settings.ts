/** Per-user window settings, stored in chrome.storage.local. */
export interface Settings {
  /** Window left edge, in viewport CSS pixels. */
  x: number;
  /** Window top edge, in viewport CSS pixels. */
  y: number;
  scale: 1 | 2;
}

const KEY = 'ytamp.settings';
const DEFAULTS: Settings = { x: 24, y: 24, scale: 1 };

function sanitize(raw: unknown): Partial<Settings> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (typeof r.x === 'number' && Number.isFinite(r.x)) out.x = r.x;
  if (typeof r.y === 'number' && Number.isFinite(r.y)) out.y = r.y;
  if (r.scale === 1 || r.scale === 2) out.scale = r.scale;
  return out;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await chrome.storage.local.get(KEY);
    return { ...DEFAULTS, ...sanitize(stored[KEY]) };
  } catch {
    // Storage can be unavailable (private windows, blocked site data). Use defaults.
    return { ...DEFAULTS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: settings });
  } catch {
    // Non-fatal: the window still works, it just won't remember its position.
  }
}
