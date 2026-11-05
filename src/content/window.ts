/**
 * The Winamp-style main window, rendered in a Shadow DOM so YTM's CSS
 * cannot leak in and ours cannot leak out.
 *
 * Phase 3: the window renders playback state and sends commands. It knows
 * nothing about YTM. The content script passes in `send` (to the bridge)
 * and calls `handle.update()` with each state.
 */
import css from './skin.css';
import { loadSettings, saveSettings, type Settings } from '../shared/settings';
import type { Command, PlaybackState } from '../shared/protocol';

const HOST_ID = 'llamatubemusic-host';
const BASE_W = 275;
const BASE_H = 116;
const SPECTRUM_BARS = 14;
/** Minimum gap between volume commands while dragging, in ms. */
const VOLUME_THROTTLE_MS = 60;

export interface WindowHandle {
  update(state: PlaybackState): void;
  /** Sets the spectrum targets. The bars ease toward them every animation frame. */
  spectrum(bins: number[], silent: boolean): void;
}

type Send = (cmd: Command) => void;

const TEMPLATE = `
  <div class="titlebar" part="titlebar">
    <span class="title">LLAMATUBEMUSIC</span>
    <button class="scale" type="button" title="Toggle 2x size">2x</button>
  </div>
  <div class="lcd" title="Click to switch elapsed and remaining time">
    <span class="time">0:00</span>
  </div>
  <div class="track"><span class="marquee"></span></div>
  <div class="spectrum" aria-hidden="true"></div>
  <div class="transport">
    <button type="button" class="btn prev" title="Previous" data-op="prev"><i></i></button>
    <button type="button" class="btn play" title="Play" data-op="play"><i></i></button>
    <button type="button" class="btn pause" title="Pause" data-op="pause"><i></i></button>
    <button type="button" class="btn stop" title="Stop" data-op="stop"><i></i></button>
    <button type="button" class="btn next" title="Next" data-op="next"><i></i></button>
  </div>
  <div class="seek" aria-label="Seek"><div class="fill"></div><div class="thumb"></div></div>
  <div class="volume" aria-label="Volume"><div class="fill"></div><div class="thumb"></div></div>
`;

interface Ui {
  win: HTMLElement;
  host: HTMLElement;
  time: HTMLElement;
  lcd: HTMLElement;
  marquee: HTMLElement;
  trackBox: HTMLElement;
  play: HTMLElement;
  seek: HTMLElement;
  spectrum: HTMLElement;
  volume: HTMLElement;
}

function sizeOf(scale: 1 | 2): { w: number; h: number } {
  return { w: BASE_W * scale, h: BASE_H * scale };
}

/** Keeps the window fully inside the viewport. */
function clampPosition(x: number, y: number, scale: 1 | 2): { x: number; y: number } {
  const { w, h } = sizeOf(scale);
  const maxX = Math.max(0, window.innerWidth - w);
  const maxY = Math.max(0, window.innerHeight - h);
  return { x: Math.min(maxX, Math.max(0, x)), y: Math.min(maxY, Math.max(0, y)) };
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export async function mountWindow(send: Send): Promise<WindowHandle | null> {
  if (document.getElementById(HOST_ID)) return null;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = css;

  const win = document.createElement('div');
  win.className = 'win';
  win.innerHTML = TEMPLATE;

  // Spectrum bars are static until Phase 4.
  const spectrum = win.querySelector<HTMLElement>('.spectrum');
  if (spectrum) {
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      const bar = document.createElement('i');
      bar.style.height = `${20 + ((i * 37) % 70)}%`;
      spectrum.append(bar);
    }
  }

  shadow.append(style, win);
  document.documentElement.append(host);

  const q = <T extends HTMLElement>(sel: string) => win.querySelector<T>(sel)!;
  const ui: Ui = {
    win,
    host,
    time: q('.time'),
    lcd: q('.lcd'),
    marquee: q('.marquee'),
    trackBox: q('.track'),
    play: q('.btn.play'),
    seek: q('.seek'),
    spectrum: q('.spectrum'),
    volume: q('.volume'),
  };

  const settings = await loadSettings();
  applyLayout(host, win, settings);
  wireDrag(host, q('.titlebar'), settings);
  wireScale(host, win, settings);
  const remaining = wireLcd(ui);
  wireTransport(win, send);
  const seek = wireSeek(ui, send);
  const volume = wireVolume(ui, send);

  let latest: PlaybackState | null = null;
  // Re-render the LCD immediately on toggle, so a paused track also updates.
  ui.lcd.addEventListener('click', () => {
    if (latest) renderTime(ui, latest, remaining.get(), seek.preview());
  });

  const bars = Array.from(ui.spectrum.querySelectorAll<HTMLElement>('i'));
  const targets = new Array<number>(bars.length).fill(0);
  const levels = new Array<number>(bars.length).fill(0);
  let frame: number | null = null;

  /** Eases each bar toward its target: instant rise, slow fall. */
  const animate = (): void => {
    let active = false;
    bars.forEach((bar, i) => {
      const t = targets[i];
      levels[i] = t >= levels[i] ? t : Math.max(t, levels[i] * 0.86);
      if (levels[i] > 0.005) active = true;
      bar.style.height = `${Math.max(4, Math.round(levels[i] * 100))}%`;
    });
    frame = active ? requestAnimationFrame(animate) : null;
  };

  return {
    spectrum(bins: number[], silent: boolean): void {
      const per = bins.length / bars.length;
      for (let i = 0; i < bars.length; i++) {
        const from = Math.floor(i * per);
        const to = Math.max(from + 1, Math.floor((i + 1) * per));
        let sum = 0;
        for (let j = from; j < to; j++) sum += bins[j];
        targets[i] = sum / (to - from) / 255;
      }
      ui.spectrum.classList.toggle('silent', silent);
      ui.spectrum.title = silent ? 'No audio signal' : '';
      if (frame === null) frame = requestAnimationFrame(animate);
    },
    update(state: PlaybackState): void {
      latest = state;
      lastDuration = state.duration;
      renderTime(ui, state, remaining.get(), seek.preview());
      renderTrack(ui, state);
      ui.play.classList.toggle('active', state.playing);
      if (!seek.dragging()) renderSeek(ui, state);
      if (!volume.dragging()) renderVolume(ui, state.volume);
    },
  };
}

// ---- Layout and persistence ----

function applyLayout(host: HTMLElement, win: HTMLElement, settings: Settings): void {
  win.style.zoom = String(settings.scale);
  const pos = clampPosition(settings.x, settings.y, settings.scale);
  host.style.left = `${pos.x}px`;
  host.style.top = `${pos.y}px`;
}

function wireDrag(host: HTMLElement, handle: HTMLElement, settings: Settings): void {
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    dragging = true;
    const rect = host.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    const pos = clampPosition(e.clientX - offsetX, e.clientY - offsetY, settings.scale);
    host.style.left = `${pos.x}px`;
    host.style.top = `${pos.y}px`;
  });

  const finish = (): void => {
    if (!dragging) return;
    dragging = false;
    const rect = host.getBoundingClientRect();
    settings.x = rect.left;
    settings.y = rect.top;
    void saveSettings(settings);
  };
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);

  window.addEventListener('resize', () => {
    const pos = clampPosition(parseFloat(host.style.left), parseFloat(host.style.top), settings.scale);
    host.style.left = `${pos.x}px`;
    host.style.top = `${pos.y}px`;
  });
}

function wireScale(host: HTMLElement, win: HTMLElement, settings: Settings): void {
  win.querySelector<HTMLButtonElement>('.scale')?.addEventListener('click', () => {
    const next: 1 | 2 = settings.scale === 1 ? 2 : 1;
    settings.scale = next;
    win.style.zoom = String(next);
    const pos = clampPosition(parseFloat(host.style.left), parseFloat(host.style.top), next);
    host.style.left = `${pos.x}px`;
    host.style.top = `${pos.y}px`;
    settings.x = pos.x;
    settings.y = pos.y;
    void saveSettings(settings);
  });
}

// ---- Controls ----

/** Returns a getter for the current LCD mode: elapsed or remaining. */
function wireLcd(ui: Ui): { get: () => boolean } {
  let showRemaining = false;
  ui.lcd.addEventListener('click', () => {
    showRemaining = !showRemaining;
    ui.lcd.classList.toggle('remaining', showRemaining);
  });
  return { get: () => showRemaining };
}

function wireTransport(win: HTMLElement, send: Send): void {
  win.querySelectorAll<HTMLButtonElement>('.btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.op as Command['op'] | undefined;
      if (op) send({ op } as Command);
    });
  });
}

interface SliderState {
  dragging: () => boolean;
  preview: () => number | null;
}

function wireSeek(ui: Ui, send: Send): SliderState {
  let dragging = false;
  let previewTime: number | null = null;

  const fractionOf = (e: PointerEvent): number => {
    const rect = ui.seek.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  ui.seek.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    ui.seek.setPointerCapture(e.pointerId);
    previewTime = null;
    e.preventDefault();
  });

  ui.seek.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    const f = fractionOf(e);
    previewTime = f * (lastDuration || 0);
    setSeekBar(ui, f);
    ui.time.textContent = fmt(previewTime);
  });

  const finish = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    const f = fractionOf(e);
    if (lastDuration > 0) send({ op: 'seek', time: f * lastDuration });
    previewTime = null;
  };
  ui.seek.addEventListener('pointerup', finish);
  ui.seek.addEventListener('pointercancel', () => {
    dragging = false;
    previewTime = null;
  });

  return { dragging: () => dragging, preview: () => previewTime };
}

/** Duration from the latest state, used by the seek handlers. */
let lastDuration = 0;

function wireVolume(ui: Ui, send: Send): SliderState {
  let dragging = false;
  let lastSentAt = 0;
  let lastSentValue: number | null = null;

  const valueOf = (e: PointerEvent): number => {
    const rect = ui.volume.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    return Math.round(f * 100);
  };

  const apply = (e: PointerEvent, force: boolean): void => {
    const value = valueOf(e);
    renderVolume(ui, value);
    if (value === lastSentValue) return; // nothing new to tell YTM
    const now = performance.now();
    if (force || now - lastSentAt >= VOLUME_THROTTLE_MS) {
      lastSentAt = now;
      lastSentValue = value;
      send({ op: 'volume', value });
    }
  };

  ui.volume.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    ui.volume.setPointerCapture(e.pointerId);
    apply(e, true);
    e.preventDefault();
  });
  ui.volume.addEventListener('pointermove', (e: PointerEvent) => {
    if (dragging) apply(e, false);
  });
  const finish = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    apply(e, true);
  };
  ui.volume.addEventListener('pointerup', finish);
  ui.volume.addEventListener('pointercancel', () => {
    dragging = false;
  });

  return { dragging: () => dragging, preview: () => null };
}

// ---- Rendering ----

function setSeekBar(ui: Ui, fraction: number): void {
  const pct = `${fraction * 100}%`;
  (ui.seek.querySelector('.fill') as HTMLElement).style.width = pct;
  (ui.seek.querySelector('.thumb') as HTMLElement).style.left = `calc(${pct} - 3px)`;
}

function renderSeek(ui: Ui, state: PlaybackState): void {
  const f = state.duration > 0 ? state.currentTime / state.duration : 0;
  setSeekBar(ui, Math.min(1, Math.max(0, f)));
}

function renderVolume(ui: Ui, volume: number): void {
  const pct = `${Math.min(100, Math.max(0, volume))}%`;
  (ui.volume.querySelector('.fill') as HTMLElement).style.width = pct;
  (ui.volume.querySelector('.thumb') as HTMLElement).style.left = `calc(${pct} - 3px)`;
}

function renderTime(
  ui: Ui,
  state: PlaybackState,
  showRemaining: boolean,
  preview: number | null,
): void {
  if (preview !== null) return; // the drag preview owns the LCD while dragging
  if (!state.ready) {
    ui.time.textContent = '0:00';
    return;
  }
  ui.time.textContent = showRemaining
    ? `-${fmt(Math.max(0, state.duration - state.currentTime))}`
    : fmt(state.currentTime);
}

function renderTrack(ui: Ui, state: PlaybackState): void {
  const text = !state.ready
    ? 'Open a song in YouTube Music'
    : state.track
      ? `${state.track.artist} - ${state.track.title}`
      : 'Not playing';
  if (ui.marquee.dataset.text === text) return;
  ui.marquee.dataset.text = text;
  // Duplicate the text so the marquee loops seamlessly when it overflows.
  ui.marquee.textContent = `${text}     ${text}     `;
  // Scroll whenever the two looped copies together overflow the box. Checking
  // only one copy missed titles that were wider than the box but narrower
  // than two copies.
  ui.marquee.classList.toggle('scroll', ui.marquee.scrollWidth > ui.trackBox.clientWidth);
}
