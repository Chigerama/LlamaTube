/**
 * Message protocol between the MAIN-world bridge and the isolated content script.
 * Both bundles import this file, so the schema exists in exactly one place.
 *
 * Every message is a plain object tagged with NS. Anything arriving over
 * window.postMessage is untrusted (any page script can post), so receivers
 * must run parseMessage() and drop anything that fails validation.
 */

export const NS = 'llamatubemusic:v1' as const;

export interface TrackInfo {
  title: string;
  artist: string;
  album: string;
  artwork: string | null;
}

export interface PlaybackState {
  /** True once a media element or the player API has been found. */
  ready: boolean;
  playing: boolean;
  /** Seconds. */
  currentTime: number;
  /** Seconds; 0 when unknown. */
  duration: number;
  /** 0..100, YTM's own volume scale. */
  volume: number;
  muted: boolean;
  track: TrackInfo | null;
}

/** One visualiser frame: 32 frequency bins (0..255). `silent` means the analyser read all zeros. */
export interface SpectrumFrame {
  bins: number[];
  silent: boolean;
}

/** One row of the up-next queue. `current` marks the playing track. */
export interface QueueItem {
  title: string;
  artist: string;
  current: boolean;
}

/** Queue snapshot. `available` is false when YTM's queue is not in the page. */
export interface QueueSnapshot {
  available: boolean;
  items: QueueItem[];
}

export type Command =
  | { op: 'play' }
  | { op: 'pause' }
  | { op: 'toggle' }
  | { op: 'stop' }
  | { op: 'next' }
  | { op: 'prev' }
  | { op: 'seek'; time: number }
  | { op: 'volume'; value: number }
  | { op: 'playIndex'; index: number }
  | { op: 'queueWatch'; on: boolean }
  | { op: 'videoMode' };

export type Message =
  | { ns: typeof NS; kind: 'hello' }
  | { ns: typeof NS; kind: 'state'; payload: PlaybackState }
  | { ns: typeof NS; kind: 'cmd'; payload: Command }
  | { ns: typeof NS; kind: 'spectrum'; payload: SpectrumFrame }
  | { ns: typeof NS; kind: 'queue'; payload: QueueSnapshot };

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';

function isTrack(x: unknown): x is TrackInfo {
  return (
    isObj(x) &&
    isStr(x.title) &&
    isStr(x.artist) &&
    isStr(x.album) &&
    (x.artwork === null || isStr(x.artwork))
  );
}

function isState(x: unknown): x is PlaybackState {
  return (
    isObj(x) &&
    isBool(x.ready) &&
    isBool(x.playing) &&
    isNum(x.currentTime) &&
    isNum(x.duration) &&
    isNum(x.volume) &&
    isBool(x.muted) &&
    (x.track === null || isTrack(x.track))
  );
}

function isSpectrum(x: unknown): x is SpectrumFrame {
  return (
    isObj(x) &&
    Array.isArray(x.bins) &&
    x.bins.length >= 1 &&
    x.bins.length <= 64 &&
    x.bins.every((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 255) &&
    isBool(x.silent)
  );
}

function isQueue(x: unknown): x is QueueSnapshot {
  return (
    isObj(x) &&
    isBool(x.available) &&
    Array.isArray(x.items) &&
    x.items.length <= 200 &&
    x.items.every((it) => isObj(it) && isStr(it.title) && isStr(it.artist) && isBool(it.current))
  );
}

function isCommand(x: unknown): x is Command {
  if (!isObj(x) || !isStr(x.op)) return false;
  switch (x.op) {
    case 'play':
    case 'pause':
    case 'toggle':
    case 'stop':
    case 'next':
    case 'prev':
      return true;
    case 'seek':
      return isNum(x.time);
    case 'volume':
      return isNum(x.value);
    case 'playIndex':
      return Number.isInteger(x.index) && (x.index as number) >= 0;
    case 'queueWatch':
      return isBool(x.on);
    case 'videoMode':
      return true;
    default:
      return false;
  }
}

/** Returns a typed message, or null if the data is not a valid llamatubemusic message. */
export function parseMessage(data: unknown): Message | null {
  if (!isObj(data) || data.ns !== NS || !isStr(data.kind)) return null;
  switch (data.kind) {
    case 'hello':
      return { ns: NS, kind: 'hello' };
    case 'state':
      return isState(data.payload) ? { ns: NS, kind: 'state', payload: data.payload } : null;
    case 'cmd':
      return isCommand(data.payload) ? { ns: NS, kind: 'cmd', payload: data.payload } : null;
    case 'spectrum':
      return isSpectrum(data.payload) ? { ns: NS, kind: 'spectrum', payload: data.payload } : null;
    case 'queue':
      return isQueue(data.payload) ? { ns: NS, kind: 'queue', payload: data.payload } : null;
    default:
      return null;
  }
}

/** Posts to our own window only. Never use '*' as the target origin. */
export function post(msg: Message): void {
  window.postMessage(msg, window.location.origin);
}
