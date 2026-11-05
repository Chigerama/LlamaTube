# LLamaTubeMusic

A Winamp 2.x-style overlay for YouTube Music. YouTube Music stays the playback
engine. LLamaTubeMusic only skins and controls it. It works in the browser tab and in the
installed YouTube Music PWA window.

> **Status: Phase 1 of 5.** The bridge and state sync are built. There is no
> visible window yet. State is logged to the DevTools console.

## Build and install

```bash
npm install
npm run typecheck
npm run build        # writes dist/bridge.js and dist/content.js
```

1. Open `chrome://extensions`, turn on **Developer mode**.
2. Click **Load unpacked** and select this folder (the one with `manifest.json`).
3. After each rebuild, click the reload icon on the LLamaTubeMusic card, then reload `music.youtube.com`.

## Architecture

| Layer | File | World | Job |
|---|---|---|---|
| Adapter | `src/bridge/adapter.ts` | MAIN | Every YTM selector and API name. The only file to edit when YTM changes |
| Bridge | `src/bridge/bridge.ts` | MAIN | Emits state, executes commands, runs the audio graph (Phase 4) |
| Content | `src/content/content.ts` | ISOLATED | UI and storage. Phase 1: console logging |
| Protocol | `src/shared/protocol.ts` | both | Message schema and validation (`llamatubemusic:v1`) |

Messages go over `window.postMessage`. Every message is validated. Commands are
accepted only from `event.source === window`.

## Keyboard shortcuts

None yet. Planned for Phase 5.

## Console testing (Phase 1)

Run these in DevTools on `music.youtube.com` (page context, not extension context):

```js
// Pause, play, seek to 30 s, set volume to 40
postMessage({ ns: 'llamatubemusic:v1', kind: 'cmd', payload: { op: 'pause' } }, location.origin);
postMessage({ ns: 'llamatubemusic:v1', kind: 'cmd', payload: { op: 'play' } }, location.origin);
postMessage({ ns: 'llamatubemusic:v1', kind: 'cmd', payload: { op: 'seek', time: 30 } }, location.origin);
postMessage({ ns: 'llamatubemusic:v1', kind: 'cmd', payload: { op: 'volume', value: 40 } }, location.origin);
```

## When YTM changes: fixing the adapter

Symptoms and where to look:

| Symptom | Fix in `adapter.ts` |
|---|---|
| Track title or artist blank | `SEL.titleDom` / `SEL.artistDom`, or check `navigator.mediaSession.metadata` |
| Play, pause, next, or seek do nothing | Player method names in `PlayerApi`, then the DOM fallbacks in `SEL` |
| `ready=false` in the log | `SEL.player`, `SEL.playerHost`, or `SEL.video` |
| Volume reads 0 or goes stale | `getVolume` / `setVolume` on the player |

Re-run the probe in the Phase 1 checklist after any YTM update. It shows which surfaces still exist.

## Privacy and security notes

- The extension requests only `host_permissions` for `music.youtube.com`. It reads no other site data.
- Page scripts can post to `window`, so the bridge treats every inbound message as untrusted.
- The bridge runs in the page's world, so it can be observed by YTM's own scripts. It holds no secrets.
