/**
 * Isolated-world content script. Phase 1: logs bridge state to the console.
 * The Shadow DOM window arrives in Phase 2.
 */
import { NS, parseMessage, post, type PlaybackState } from '../shared/protocol';

declare global {
  interface Window {
    __ytampContent?: boolean;
  }
}

if (!window.__ytampContent) {
  window.__ytampContent = true;

  let prev: PlaybackState | null = null;

  const fmt = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  function log(state: PlaybackState): void {
    const track = state.track ? `${state.track.artist} - ${state.track.title}` : '(no track)';
    const changed =
      !prev ||
      prev.playing !== state.playing ||
      prev.volume !== state.volume ||
      prev.muted !== state.muted ||
      prev.track?.title !== state.track?.title ||
      prev.track?.artist !== state.track?.artist ||
      prev.ready !== state.ready;
    if (changed) {
      console.log(
        `[YTAmp] ${state.playing ? 'PLAY ' : 'PAUSE'} | ${track} | ` +
          `${fmt(state.currentTime)} / ${fmt(state.duration)} | vol ${state.volume}` +
          `${state.muted ? ' (muted)' : ''} | ready=${state.ready}`,
      );
    }
    prev = state;
  }

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return;
    const msg = parseMessage(e.data);
    if (msg?.kind === 'state') log(msg.payload);
  });

  post({ ns: NS, kind: 'hello' });
  console.log('[YTAmp] content script loaded (Phase 1: console only)');
}
