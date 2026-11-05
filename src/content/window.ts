/**
 * The Winamp-style main window, rendered in a Shadow DOM so YTM's CSS
 * cannot leak in and ours cannot leak out. Phase 2: static layout, drag,
 * remembered position, and a 1x/2x toggle. Controls are not wired yet.
 */
import css from './skin.css';
import { loadSettings, saveSettings, type Settings } from '../shared/settings';

const HOST_ID = 'ytamp-host';
/** Base size at 1x, from the brief: ~275x116. */
const BASE_W = 275;
const BASE_H = 116;
const SPECTRUM_BARS = 14;

const TEMPLATE = `
  <div class="titlebar" part="titlebar">
    <span class="title">YTAMP</span>
    <button class="scale" type="button" title="Toggle 2x size">2x</button>
  </div>
  <div class="lcd"><span class="time">0:00</span></div>
  <div class="track"><span>Not playing</span></div>
  <div class="spectrum" aria-hidden="true"></div>
  <div class="transport">
    <button type="button" class="btn prev" title="Previous"><i></i></button>
    <button type="button" class="btn play" title="Play"><i></i></button>
    <button type="button" class="btn pause" title="Pause"><i></i></button>
    <button type="button" class="btn stop" title="Stop"><i></i></button>
    <button type="button" class="btn next" title="Next"><i></i></button>
  </div>
  <div class="seek" aria-label="Seek"><div class="fill"></div><div class="thumb"></div></div>
  <div class="volume" aria-label="Volume"><div class="fill"></div><div class="thumb"></div></div>
`;

function sizeOf(scale: 1 | 2): { w: number; h: number } {
  return { w: BASE_W * scale, h: BASE_H * scale };
}

/** Keeps the window fully inside the viewport. */
function clampPosition(x: number, y: number, scale: 1 | 2): { x: number; y: number } {
  const { w, h } = sizeOf(scale);
  const maxX = Math.max(0, window.innerWidth - w);
  const maxY = Math.max(0, window.innerHeight - h);
  return {
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}

export async function mountWindow(): Promise<void> {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = css;

  const win = document.createElement('div');
  win.className = 'win';
  win.innerHTML = TEMPLATE;

  // Static placeholder bars. Phase 4 replaces these with live analyser data.
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

  const settings = await loadSettings();
  applyLayout(host, win, settings);
  wireDrag(host, win.querySelector<HTMLElement>('.titlebar')!, settings);
  wireScale(host, win, settings);
}

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
    if ((e.target as HTMLElement).closest('button')) return; // let the scale button click through
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

  // Keep the window on screen if the browser window is resized.
  window.addEventListener('resize', () => {
    const pos = clampPosition(parseFloat(host.style.left), parseFloat(host.style.top), settings.scale);
    host.style.left = `${pos.x}px`;
    host.style.top = `${pos.y}px`;
  });
}

function wireScale(host: HTMLElement, win: HTMLElement, settings: Settings): void {
  const btn = win.querySelector<HTMLButtonElement>('.scale');
  btn?.addEventListener('click', () => {
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
