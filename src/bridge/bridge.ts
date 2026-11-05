/**
 * MAIN-world bridge. Runs inside the YTM page so it can reach the player API,
 * the media element and the audio graph. It reads state, emits changes,
 * executes commands from the content script, and streams spectrum frames
 * while audio is playing.
 */
import { NS, parseMessage, post, type PlaybackState } from '../shared/protocol';
import { findVideo, isPlaying, readQueue, readState, runCommand } from './adapter';
import { attachTap, readBins, wireGestureResume } from './audio-graph';

declare global {
  interface Window {
    __llamatubemusicBridge?: boolean;
  }
}

if (!window.__llamatubemusicBridge) {
  window.__llamatubemusicBridge = true;

  const MEDIA_EVENTS = [
    'play',
    'playing',
    'pause',
    'ended',
    'emptied',
    'loadedmetadata',
    'durationchange',
    'seeked',
    'volumechange',
    'timeupdate',
  ] as const;

  const TIME_EPSILON = 0.25; // seconds of playback movement before a time-only emit
  const SPECTRUM_INTERVAL_MS = 33; // about 30 frames per second
  const ZEROS = new Array<number>(32).fill(0);

  let last: PlaybackState | null = null;
  let spectrumTimer: number | null = null;

  function startSpectrum(): void {
    if (spectrumTimer !== null) return;
    spectrumTimer = window.setInterval(spectrumTick, SPECTRUM_INTERVAL_MS);
  }

  function stopSpectrum(): void {
    if (spectrumTimer === null) return;
    window.clearInterval(spectrumTimer);
    spectrumTimer = null;
    // One zero frame lets the window ease its bars down.
    post({ ns: NS, kind: 'spectrum', payload: { bins: ZEROS, silent: false } });
  }

  function spectrumTick(): void {
    const video = findVideo();
    if (!video || !isPlaying()) return;
    if (!attachTap(video)) return;
    const frame = readBins();
    if (frame) post({ ns: NS, kind: 'spectrum', payload: frame });
  }

  // The queue is sent only while the window's playlist panel is open.
  const QUEUE_INTERVAL_MS = 1500;
  let queueTimer: number | null = null;

  function postQueue(): void {
    post({ ns: NS, kind: 'queue', payload: readQueue() });
  }

  function setQueueWatch(on: boolean): void {
    if (on && queueTimer === null) {
      postQueue();
      queueTimer = window.setInterval(postQueue, QUEUE_INTERVAL_MS);
    } else if (!on && queueTimer !== null) {
      window.clearInterval(queueTimer);
      queueTimer = null;
    }
  }

  /** Emits when anything other than time changed, or time moved past the epsilon. */
  function emit(force = false): void {
    const state = readState();
    const changed =
      !last ||
      JSON.stringify({ ...state, currentTime: 0 }) !== JSON.stringify({ ...last, currentTime: 0 }) ||
      Math.abs(state.currentTime - last.currentTime) >= TIME_EPSILON;
    if (state.playing) startSpectrum();
    else stopSpectrum();
    if (!force && !changed) return;
    last = state;
    post({ ns: NS, kind: 'state', payload: state });
  }

  // Capture phase on document: catches media events from any <video> element,
  // including one YTM swaps in later. The spectrum tap re-attaches on each tick.
  for (const type of MEDIA_EVENTS) {
    document.addEventListener(type, () => emit(), true);
  }

  wireGestureResume();

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return;
    const msg = parseMessage(e.data);
    if (!msg) return;
    if (msg.kind === 'hello') {
      emit(true);
    } else if (msg.kind === 'cmd') {
      if (msg.payload.op === 'queueWatch') setQueueWatch(msg.payload.on);
      else runCommand(msg.payload);
    }
  });

  // Light fallback: catches track changes (mediaSession has no event) and anything missed.
  setInterval(() => emit(), 1000);

  emit(true);
}
