/**
 * MAIN-world bridge. Runs inside the YTM page so it can reach the player API
 * and the media element. It reads state, emits changes, and executes commands
 * sent by the isolated content script.
 */
import { NS, parseMessage, post, type PlaybackState } from '../shared/protocol';
import { readState, runCommand } from './adapter';

declare global {
  interface Window {
    __ytampBridge?: boolean;
  }
}

if (!window.__ytampBridge) {
  window.__ytampBridge = true;

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
  let last: PlaybackState | null = null;

  /** Emits when anything other than time changed, or time moved past the epsilon. */
  function emit(force = false): void {
    const state = readState();
    const changed =
      !last ||
      JSON.stringify({ ...state, currentTime: 0 }) !== JSON.stringify({ ...last, currentTime: 0 }) ||
      Math.abs(state.currentTime - last.currentTime) >= TIME_EPSILON;
    if (!force && !changed) return;
    last = state;
    post({ ns: NS, kind: 'state', payload: state });
  }

  // Capture phase on document: catches media events from any <video> element,
  // including one YTM swaps in later. Audio graph rebuilds hook in here in Phase 4.
  for (const type of MEDIA_EVENTS) {
    document.addEventListener(type, () => emit(), true);
  }

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return;
    const msg = parseMessage(e.data);
    if (!msg) return;
    if (msg.kind === 'hello') {
      emit(true);
    } else if (msg.kind === 'cmd') {
      runCommand(msg.payload);
    }
  });

  // Light fallback: catches track changes (mediaSession has no event) and anything missed.
  setInterval(() => emit(), 1000);

  emit(true);
}
