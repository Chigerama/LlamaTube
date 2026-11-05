/** Per-user window settings, stored in chrome.storage.local. */
export interface Settings {
  /** Window left edge, in viewport CSS pixels. */
  x: number;
  /** Window top edge, in viewport CSS pixels. */
  y: number;
  scale: 1 | 2;
  /** Whether the window is shown. Toggled from the toolbar or the shortcut. */
  visible: boolean;
  /** Hide-YTM-UI mode: a dark cover sits behind the window. */
  hideUi: boolean;
  /** Up-next panel height, in CSS pixels at 1x. */
  plHeight: number;
}

const KEY = 'llamatubemusic.settings';
export const MIN_PL_H = 48;
export const MAX_PL_H = 1000;
const DEFAULTS: Settings = { x: 24, y: 24, scale: 1, visible: true, hideUi: false, plHeight: 120 };

function sanitize(raw: unknown): Partial<Settings> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (typeof r.x === 'number' && Number.isFinite(r.x)) out.x = r.x;
  if (typeof r.y === 'number' && Number.isFinite(r.y)) out.y = r.y;
  if (r.scale === 1 || r.scale === 2) out.scale = r.scale;
  if (typeof r.visible === 'boolean') out.visible = r.visible;
  if (typeof r.hideUi === 'boolean') out.hideUi = r.hideUi;
  if (typeof r.plHeight === 'number' && Number.isFinite(r.plHeight)) {
    out.plHeight = Math.min(MAX_PL_H, Math.max(MIN_PL_H, r.plHeight));
  }
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
