/**
 * The Winamp-style main window, rendered in a Shadow DOM so YTM's CSS
 * cannot leak in and ours cannot leak out.
 *
 * Phase 3: the window renders playback state and sends commands. It knows
 * nothing about YTM. The content script passes in `send` (to the bridge)
 * and calls `handle.update()` with each state.
 */
import css from './skin.css';
import { loadSettings, saveSettings, MIN_PL_H, MAX_PL_H, type Settings } from '../shared/settings';
import type { Command, PlaybackState, QueueSnapshot } from '../shared/protocol';

const HOST_ID = 'llamatubemusic-host';
const BASE_W = 275;
const BASE_H = 116;
const SPECTRUM_BARS = 14;
/** Minimum gap between volume commands while dragging, in ms. */
const VOLUME_THROTTLE_MS = 60;

export interface WindowHandle {
  update(state: PlaybackState): void;
  /** Shows or hides the window, and saves the choice. */
  toggleVisible(): void;
  /** Shows the latest up-next snapshot in the playlist panel. */
  queue(snapshot: QueueSnapshot): void;
  /** Sets the spectrum targets. The bars ease toward them every animation frame. */
  spectrum(bins: number[], silent: boolean): void;
}

type Send = (cmd: Command) => void;

const TEMPLATE = `
  <div class="titlebar" part="titlebar">
    <span class="title">LLAMATUBEMUSIC</span>
    <button class="vdbtn" type="button" title="Video">VD</button>
    <button class="plbtn" type="button" title="Up next">PL</button>
    <button class="popout" type="button" title="Pop out into a separate window">PIP</button>
    <button class="hideui" type="button" title="Hide YouTube Music behind the window">UI</button>
    <button class="scale" type="button" title="Toggle 2x size">2x</button>
    <button class="close" type="button" title="Hide LLamaTubeMusic">×</button>
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
  <div class="playlist" aria-label="Up next"></div>
  <div class="video" aria-label="Video">
    <video class="mirror" muted playsinline></video>
    <div class="vd-empty">Video not available here.</div>
    <button class="fs" type="button" title="Full screen">FS</button>
  </div>
  <div class="pl-grip" title="Drag to resize the list"></div>
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

  // Dark cover for hide-UI mode. It sits inside the host, so hiding the host hides it too.
  const veil = document.createElement('div');
  veil.className = 'veil';
  // Full-viewport video for the fullscreen view. It shares the mirror's stream.
  const fsView = document.createElement('div');
  fsView.className = 'fsview';
  fsView.innerHTML = '<video class="fs-mirror" muted playsinline></video>';
  shadow.append(style, veil, fsView, win);
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

  const applyVisibility = (): void => {
    host.style.display = settings.visible ? '' : 'none';
    win.style.display = settings.visible ? '' : 'none';
    veil.classList.toggle('on', settings.visible && settings.hideUi);
    win.querySelector('.hideui')?.classList.toggle('active', settings.hideUi);
  };
  applyVisibility();
  win.querySelector<HTMLButtonElement>('.hideui')?.addEventListener('click', () => {
    settings.hideUi = !settings.hideUi;
    applyVisibility();
    void saveSettings(settings);
  });
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

  // ---- Pop out into a separate always-on-top window (Document Picture-in-Picture) ----
  // The window element is moved, not copied, so its listeners and the live UI
  // references keep working. Closing the popped window puts it back in the page.
  type PipApi = { requestWindow(options: { width: number; height: number }): Promise<Window> };
  const pipApi = (window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
  const popBtn = win.querySelector<HTMLButtonElement>('.popout');
  let pipWin: Window | null = null;

  const popOut = async (): Promise<void> => {
    if (pipWin) {
      pipWin.close();
      return;
    }
    if (!pipApi) {
      console.warn('[LLamaTubeMusic] Picture-in-Picture is not available in this browser.');
      return;
    }
    const pip = await pipApi.requestWindow({ width: BASE_W * settings.scale, height: BASE_H * settings.scale });
    const doc = pip.document;
    doc.title = 'LLamaTubeMusic';
    doc.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
    const pipHost = doc.createElement('div');
    doc.body.append(pipHost);
    const pipShadow = pipHost.attachShadow({ mode: 'open' });
    const pipStyle = doc.createElement('style');
    pipStyle.textContent = css;
    pipShadow.append(pipStyle, win);
    win.style.zoom = String(settings.scale);
    host.dataset.popped = 'true';
    popBtn?.classList.add('active');
    pipWin = pip;
    pip.addEventListener('resize', () => onPipResized(pip));
    pip.addEventListener('pagehide', () => {
      shadow.append(win);
      win.style.zoom = String(settings.scale);
      delete host.dataset.popped;
      popBtn?.classList.remove('active');
      pipWin = null;
    });
  };
  popBtn?.addEventListener('click', () => {
    void popOut();
  });
  // Closing the YouTube Music tab also closes the popped window, since the bridge is gone.
  window.addEventListener('pagehide', () => pipWin?.close());

  // In-app close button: hides the window, like the shortcut. Closes the popped window too.
  win.querySelector<HTMLButtonElement>('.close')?.addEventListener('click', () => {
    settings.visible = false;
    applyVisibility();
    void saveSettings(settings);
    pipWin?.close();
  });

  // ---- Up-next playlist panel (expands below the window) ----
  const plBtn = win.querySelector<HTMLButtonElement>('.plbtn');
  const plist = win.querySelector<HTMLElement>('.playlist')!;
  let playlistOpen = false;

  const setPlaylistOpen = (open: boolean): void => {
    playlistOpen = open;
    win.classList.toggle('expanded', open);
    plBtn?.classList.toggle('active', open);
    send({ op: 'queueWatch', on: open });
    // A popped-out window needs its own height to match. Browsers may refuse the resize.
    if (pipWin) {
      try {
        fitPipContent(pipWin, BASE_W * settings.scale, contentHeight() * settings.scale);
      } catch {
        console.warn('[LLamaTubeMusic] Could not resize the popped-out window.');
      }
    }
  };
  plBtn?.addEventListener('click', () => setPlaylistOpen(!playlistOpen));

  // Delegated click: one listener for every row.
  plist.addEventListener('click', (e: MouseEvent) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (row) send({ op: 'playIndex', index: Number(row.dataset.index) });
  });

  /** Rebuilds the rows with textContent only, so track names are never parsed as HTML. */
  const renderQueue = (snapshot: QueueSnapshot): void => {
    plist.replaceChildren();
    if (!snapshot.available) {
      const note = document.createElement('div');
      note.className = 'pl-empty';
      note.textContent = 'Queue not found in YouTube Music. Open the queue panel there, then try again.';
      plist.append(note);
      return;
    }
    if (snapshot.items.length === 0) {
      const note = document.createElement('div');
      note.className = 'pl-empty';
      note.textContent = 'The queue is empty.';
      plist.append(note);
      return;
    }
    snapshot.items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = item.current ? 'pl-row current' : 'pl-row';
      row.dataset.index = String(i);
      row.textContent = `${i + 1}. ${item.artist ? item.artist + ' - ' : ''}${item.title}`;
      plist.append(row);
    });
  };

  // ---- Resizable list: drag the corner grip, or resize the popped-out window. Height is remembered. ----
  const grip = win.querySelector<HTMLElement>('.pl-grip')!;
  win.style.setProperty('--pl-h', `${settings.plHeight}px`);
  let resizing: { startY: number; startH: number } | null = null;

  /** Resizes a window so its content area is contentW x contentH. Chrome's frame is added on top. */
  const fitPipContent = (p: Window, contentW: number, contentH: number): void => {
    const frameW = p.outerWidth - p.innerWidth;
    const frameH = p.outerHeight - p.innerHeight;
    p.resizeTo(contentW + frameW, contentH + frameH);
  };

  /** Largest list height that fits. A popped-out window is sized by the user, so it is capped only by MAX_PL_H. */
  const maxPlHeight = (): number => {
    if (pipWin) return MAX_PL_H;
    const hostTop = host.getBoundingClientRect().top;
    return Math.min(MAX_PL_H, (window.innerHeight - hostTop) / settings.scale - BASE_H - (videoOpen ? VIDEO_H : 0));
  };

  const setPlHeight = (h: number): void => {
    settings.plHeight = h;
    win.style.setProperty('--pl-h', `${h}px`);
    if (pipWin) fitPipContent(pipWin, BASE_W * settings.scale, contentHeight() * settings.scale);
    void saveSettings(settings);
  };

  /**
   * Keeps a popped-out window at least as large as its content, and makes the list
   * fill whatever height the user gives the window.
   */
  const onPipResized = (p: Window): void => {
    const s = settings.scale;
    const minW = BASE_W * s;
    const minH = (BASE_H + (videoOpen ? VIDEO_H : 0) + (playlistOpen ? MIN_PL_H : 0)) * s;
    if (p.innerWidth < minW - 0.5 || p.innerHeight < minH - 0.5) {
      fitPipContent(p, Math.max(p.innerWidth, minW), Math.max(p.innerHeight, minH));
      return;
    }
    if (playlistOpen) {
      const h = Math.round(p.innerHeight / s - BASE_H - (videoOpen ? VIDEO_H : 0));
      if (h !== settings.plHeight) {
        settings.plHeight = h;
        win.style.setProperty('--pl-h', `${h}px`);
        void saveSettings(settings);
      }
    }
  };

  grip.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    resizing = { startY: e.clientY, startH: settings.plHeight };
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });
  grip.addEventListener('pointermove', (e: PointerEvent) => {
    if (!resizing) return;
    // Pointer movement is in viewport pixels; the window is scaled by settings.scale.
    const dy = (e.clientY - resizing.startY) / settings.scale;
    const h = Math.round(Math.min(Math.max(resizing.startH + dy, MIN_PL_H), maxPlHeight()));
    win.style.setProperty('--pl-h', `${h}px`);
  });
  const finishResize = (e: PointerEvent): void => {
    if (!resizing) return;
    const dy = (e.clientY - resizing.startY) / settings.scale;
    const h = Math.round(Math.min(Math.max(resizing.startH + dy, MIN_PL_H), maxPlHeight()));
    resizing = null;
    setPlHeight(h);
  };
  grip.addEventListener('pointerup', finishResize);
  grip.addEventListener('pointercancel', () => {
    resizing = null;
    win.style.setProperty('--pl-h', `${settings.plHeight}px`);
  });

  // ---- Video panel: a muted mirror of YouTube Music's video, with full screen. ----
  // The mirror uses captureStream(), so YouTube Music keeps the audio and its player is untouched.
  const VIDEO_H = 155; // 16:9 at 275 px wide
  const vdBtn = win.querySelector<HTMLButtonElement>('.vdbtn');
  const mirror = win.querySelector<HTMLVideoElement>('.mirror')!;
  const vdEmpty = win.querySelector<HTMLElement>('.vd-empty')!;
  const fsBtn = win.querySelector<HTMLButtonElement>('.fs');
  let videoOpen = false;

  /** Height of the window's content area: the window, plus the video and list when open. */
  const contentHeight = (): number =>
    BASE_H + (videoOpen ? VIDEO_H : 0) + (playlistOpen ? settings.plHeight : 0);

  type Capturable = HTMLVideoElement & { captureStream?: () => MediaStream };

  const attachMirror = (): void => {
    const source = document.querySelector<Capturable>('video');
    if (!source || typeof source.captureStream !== 'function') {
      mirror.hidden = true;
      vdEmpty.hidden = false;
      return;
    }
    try {
      mirror.srcObject = source.captureStream();
      if (fullscreenView) fsMirror.srcObject = mirror.srcObject;
      mirror.hidden = false;
      vdEmpty.hidden = true;
      void mirror.play().catch(() => undefined);
    } catch {
      mirror.hidden = true;
      vdEmpty.hidden = false;
    }
  };

  const setVideoOpen = (open: boolean): void => {
    videoOpen = open;
    win.classList.toggle('video-open', open);
    vdBtn?.classList.toggle('active', open);
    win.style.setProperty('--vd-h', open ? `${VIDEO_H}px` : '0px');
    if (open) {
      attachMirror();
    } else {
      if (mirror.ownerDocument.fullscreenElement) void mirror.ownerDocument.exitFullscreen();
      if (fullscreenView) setFullscreenView(false);
      mirror.pause();
      mirror.srcObject = null;
    }
    if (pipWin) {
      try {
        fitPipContent(pipWin, BASE_W * settings.scale, contentHeight() * settings.scale);
      } catch {
        console.warn('[LLamaTubeMusic] Could not resize the popped-out window.');
      }
    }
  };

  vdBtn?.addEventListener('click', () => setVideoOpen(!videoOpen));

  // The source element can be replaced between songs, so re-attach the mirror when media loads.
  for (const type of ['loadedmetadata', 'emptied'] as const) {
    document.addEventListener(type, () => {
      if (videoOpen) attachMirror();
    }, true);
  }

  // ---- Fullscreen view: a full-viewport copy of the video, with the browser window fullscreen. ----
  // The popped-out window can't go fullscreen itself, and a page can't fullscreen another
  // tab, so this works through the extension: the background sets the tab's window to fullscreen.
  let fullscreenView = false;
  const fsOverlay = shadow.querySelector<HTMLElement>('.fsview')!;
  const fsMirror = fsView.querySelector<HTMLVideoElement>('.fs-mirror')!;

  const setFullscreenView = (on: boolean): void => {
    if (on && !videoOpen) setVideoOpen(true);
    fullscreenView = on;
    fsOverlay.classList.toggle('on', on);
    fsMirror.srcObject = on ? mirror.srcObject : null;
    if (on) void fsMirror.play().catch(() => undefined);
    // Guarded: the page-only test harness has no extension APIs.
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      void chrome.runtime
        .sendMessage({ type: 'llamatubemusic:window-fullscreen', on })
        .catch(() => undefined);
    }
  };

  fsBtn?.addEventListener('click', () => setFullscreenView(!fullscreenView));
  document.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenView) setFullscreenView(false);
    },
    true,
  );

  return {
    queue(snapshot: QueueSnapshot): void {
      if (playlistOpen) renderQueue(snapshot);
    },
    toggleVisible(): void {
      settings.visible = !settings.visible;
      applyVisibility();
      // Hiding while popped out closes the popped window; it returns to the page, hidden.
      if (!settings.visible) pipWin?.close();
      void saveSettings(settings);
    },
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
    if (host.dataset.popped) return;
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
    if (host.dataset.popped) return;
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
