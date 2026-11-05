/**
 * The ONLY file that knows about YouTube Music internals: selectors, the player
 * API, and mediaSession. When YTM changes, fix it here and nowhere else.
 *
 * Preference order (per the brief):
 *   1. navigator.mediaSession and the <video> element, for reading state
 *   2. the player API (#movie_player), for commands and seek/volume
 *   3. DOM buttons, as a last resort
 * Never write video.currentTime or video.volume directly: that desyncs YTM's UI.
 *
 * Everything here is UNVERIFIED against live YTM until the Phase 1 probe runs.
 */
import type { Command, PlaybackState, QueueSnapshot, TrackInfo } from '../shared/protocol';

const SEL = {
  player: '#movie_player',
  playerHost: 'ytmusic-player',
  video: 'video',
  titleDom: 'ytmusic-player-bar .title',
  artistDom: 'ytmusic-player-bar .byline',
  playPause: '#play-pause-button',
  next: '.next-button',
  prev: '.previous-button',
} as const;

/** Subset of the YouTube player API that we use. Every member is optional at runtime. */
export interface PlayerApi {
  playVideo?(): void;
  pauseVideo?(): void;
  nextVideo?(): void;
  previousVideo?(): void;
  seekTo?(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime?(): number;
  getDuration?(): number;
  getVolume?(): number;
  setVolume?(volume: number): void;
}

const PLAYER_MARKERS = ['playVideo', 'pauseVideo', 'seekTo'] as const;

const clip = (s: string, max = 300): string => s.slice(0, max);
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

function text(selector: string): string {
  return document.querySelector(selector)?.textContent?.trim() ?? '';
}

export function findVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(SEL.video);
}

export function findPlayer(): PlayerApi | null {
  const hostApi = (document.querySelector(SEL.playerHost) as unknown as { playerApi?: unknown } | null)
    ?.playerApi;
  const candidates: unknown[] = [document.querySelector(SEL.player), hostApi];
  for (const c of candidates) {
    if (c && typeof c === 'object' && PLAYER_MARKERS.some((m) => typeof (c as Record<string, unknown>)[m] === 'function')) {
      return c as PlayerApi;
    }
  }
  return null;
}

function readTrack(): TrackInfo | null {
  const md = navigator.mediaSession?.metadata;
  if (md && md.title) {
    const art = md.artwork.length ? md.artwork[md.artwork.length - 1].src : null;
    return {
      title: clip(md.title),
      artist: clip(md.artist ?? ''),
      album: clip(md.album ?? ''),
      artwork: art,
    };
  }
  const title = text(SEL.titleDom);
  if (!title) return null;
  return { title: clip(title), artist: clip(text(SEL.artistDom)), album: '', artwork: null };
}

export function isPlaying(): boolean {
  const video = findVideo();
  if (video) return !video.paused && !video.ended;
  return navigator.mediaSession?.playbackState === 'playing';
}

export function readState(): PlaybackState {
  const video = findVideo();
  const player = findPlayer();
  const finite = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);

  const currentTime = video
    ? finite(video.currentTime, 0)
    : finite(player?.getCurrentTime?.() ?? 0, 0);
  const duration = video
    ? finite(video.duration, 0)
    : finite(player?.getDuration?.() ?? 0, 0);
  const volume = player?.getVolume
    ? finite(player.getVolume(), 0)
    : video
      ? finite(video.volume * 100, 0)
      : 0;

  return {
    ready: !!(video || player),
    playing: isPlaying(),
    currentTime: Math.max(0, currentTime),
    duration: Math.max(0, duration),
    volume: clamp(volume, 0, 100),
    muted: video?.muted ?? false,
    track: readTrack(),
  };
}

function click(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return false;
  el.click();
  return true;
}

/** Runs a command. Returns false if no route (API or DOM) was available. */
export function runCommand(cmd: Command): boolean {
  const player = findPlayer();
  switch (cmd.op) {
    case 'play':
      if (isPlaying()) return true;
      if (player?.playVideo) return player.playVideo(), true;
      return click(SEL.playPause);
    case 'pause':
      if (!isPlaying()) return true;
      if (player?.pauseVideo) return player.pauseVideo(), true;
      return click(SEL.playPause);
    case 'toggle':
      return runCommand({ op: isPlaying() ? 'pause' : 'play' });
    case 'stop':
      runCommand({ op: 'pause' });
      if (!player?.seekTo) return false;
      player.seekTo(0, true);
      return true;
    case 'next':
      if (player?.nextVideo) return player.nextVideo(), true;
      return click(SEL.next);
    case 'prev':
      if (player?.previousVideo) return player.previousVideo(), true;
      return click(SEL.prev);
    case 'seek':
      if (!player?.seekTo) return false;
      player.seekTo(Math.max(0, cmd.time), true);
      return true;
    case 'playIndex':
      return playQueueIndex(cmd.index);
    case 'queueWatch':
      return true; // handled by the bridge, which owns the watch timer
    case 'videoMode':
      return clickVideoMode();
    case 'volume':
      if (!player?.setVolume) return false;
      player.setVolume(clamp(Math.round(cmd.value), 0, 100));
      return true;
  }
}

// ---- Up-next queue ----
// Unverified against live YTM: these selectors need the Phase 6 probe.
const QUEUE = {
  item: 'ytmusic-player-queue-item',
  title: '.song-title',
  byline: '.byline',
  play: 'ytmusic-play-button-renderer',
} as const;

/** Reads the queue rows from the page. `available` is false when none are rendered. */
/**
 * The rows to show and to index. YouTube Music keeps hidden copies of queue rows, and
 * they duplicate what the panel shows. When the panel is open, only visible rows count.
 * When it's closed every row is hidden, so all rows are used.
 */
function queueRows(): HTMLElement[] {
  const all = Array.from(document.querySelectorAll<HTMLElement>(QUEUE.item));
  const shown = all.filter((row) => row.offsetParent !== null);
  return shown.length > 0 ? shown : all;
}

/** The video ID of a queue row, from the data YouTube Music attaches to it. */
function rowVideoId(row: HTMLElement): string | null {
  const id = (row as unknown as { data?: { videoId?: unknown } }).data?.videoId;
  return typeof id === 'string' ? id : null;
}

/** The video ID the player is playing, or null when the player doesn't report one. */
function currentVideoId(): string | null {
  const player = findPlayer() as unknown as { getVideoData?: () => { video_id?: unknown } } | null;
  const id = player?.getVideoData?.()?.video_id;
  return typeof id === 'string' ? id : null;
}

export function readQueue(): QueueSnapshot {
  const rows = queueRows();
  if (rows.length === 0) return { available: false, items: [] };
  const playingId = currentVideoId();
  const items = rows.slice(0, 200).map((row) => ({
    title: clip(row.querySelector(QUEUE.title)?.textContent?.trim() ?? ''),
    artist: clip(row.querySelector(QUEUE.byline)?.textContent?.trim() ?? ''),
    // Match by video ID when both sides have one. The "selected" attribute can point at a
    // different row than the one playing, so it is only a fallback.
    current:
      playingId !== null && rowVideoId(row) !== null
        ? rowVideoId(row) === playingId
        : row.hasAttribute('selected') || row.classList.contains('selected'),
  }));
  return { available: true, items };
}

/**
 * Plays the queue row at `index`. Prefers the player's loadVideoById with the row's
 * video ID, which is exact even when two rows share a title. Falls back to a press
 * on the row's play button if the player doesn't offer it.
 */
export function playQueueIndex(index: number): boolean {
  const row = queueRows()[index];
  if (!row) return false;
  const player = findPlayer() as (PlayerApi & { loadVideoById?: (id: string) => void }) | null;
  const videoId = (row as unknown as { data?: { videoId?: unknown } }).data?.videoId;
  if (player?.loadVideoById && typeof videoId === 'string') {
    player.loadVideoById(videoId);
    return true;
  }
  pressElement(row.querySelector<HTMLElement>(QUEUE.play) ?? row.querySelector<HTMLElement>(QUEUE.title) ?? row);
  return true;
}

/**
 * Sends the full press sequence a user's tap produces. YTM's queue rows listen for
 * pointer and mouse events, not only click, so a bare click() does nothing.
 */
function pressElement(el: HTMLElement): void {
  const init = { bubbles: true, cancelable: true, composed: true, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerId: 1, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('mousedown', init));
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerId: 1, pointerType: 'mouse' }));
  el.dispatchEvent(new MouseEvent('mouseup', init));
  el.dispatchEvent(new MouseEvent('click', init));
}

// ---- Song / Video mode ----
const VIDEO_MODE = 'ytmusic-av-toggle .video-button';

/** Clicks YouTube Music's own Video button. It switches to the video stream at the same point. */
export function clickVideoMode(): boolean {
  const button = document.querySelector<HTMLElement>(VIDEO_MODE);
  if (!button) return false;
  // Full press, like a tap: a plain click() does not trigger YouTube Music's handlers.
  pressElement(button);
  return true;
}
