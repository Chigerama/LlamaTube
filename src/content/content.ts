/**
 * Isolated-world content script. Phase 1: logs bridge state to the console.
 * The Shadow DOM window arrives in Phase 2.
 */
import { NS, parseMessage, post, type Command, type PlaybackState } from '../shared/protocol';
import { mountWindow, type WindowHandle } from './window';

declare global {
  interface Window {
    __llamatubemusicContent?: boolean;
  }
}

if (!window.__llamatubemusicContent) {
  window.__llamatubemusicContent = true;

  let prev: PlaybackState | null = null;

  const fmt = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  function log(state: PlaybackState): void {
    const track = state.track ? `${state.track.artist} - ${state.track.title}` : '(no track)';
    // Time-only updates arrive ~4x/s during playback. A gap of more than 2 s
    // between updates means a seek (or a jump), so it is logged explicitly.
    const seeked = !!prev && Math.abs(state.currentTime - prev.currentTime) > 2;
    const changed =
      !prev ||
      seeked ||
      prev.playing !== state.playing ||
      prev.volume !== state.volume ||
      prev.muted !== state.muted ||
      prev.track?.title !== state.track?.title ||
      prev.track?.artist !== state.track?.artist ||
      prev.ready !== state.ready;
    if (changed) {
      const label = seeked ? 'SEEK ' : state.playing ? 'PLAY ' : 'PAUSE';
      console.log(
        `[LLamaTubeMusic] ${label} | ${track} | ` +
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

  // The window is a view: it renders state and sends commands through `send`.
  const send = (cmd: Command): void => post({ ns: NS, kind: 'cmd', payload: cmd });
  let handle: WindowHandle | null = null;
  let latest: PlaybackState | null = null;
  void mountWindow(send).then((h) => {
    handle = h;
    if (h && latest) h.update(latest);
  });

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window) return;
    const msg = parseMessage(e.data);
    if (msg?.kind === 'spectrum') {
      handle?.spectrum(msg.payload.bins, msg.payload.silent);
      return;
    }
    if (msg?.kind !== 'state') return;
    latest = msg.payload;
    handle?.update(msg.payload);
  });

  post({ ns: NS, kind: 'hello' });
  console.log('[LLamaTubeMusic] content script loaded (Phase 3: controls wired)');
}
