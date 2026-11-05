# LLamaTubeMusic

A Winamp 2.x-style overlay for YouTube Music. YouTube Music stays the playback
engine. LLamaTubeMusic only skins and controls it. It works in the browser tab
and in the installed YouTube Music app window.

> **Status: all five phases are built.** Live testing on YouTube Music is done
> for each phase. See `test/manual-checklist.md`.

## Build and install

```bash
npm install
npm run typecheck
npm run build        # writes dist/bridge.js, dist/content.js and dist/background.js
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select this folder (the one with `manifest.json`).
3. After each rebuild, click the reload icon on the LLamaTubeMusic card, then reload `music.youtube.com`.

## Using it

| Action | How |
|---|---|
| Show or hide the window | Toolbar button, or **Alt+Shift+L** |
| Move the window | Drag the title bar. The position is remembered |
| Double or restore the size | **2x** button in the title bar |
| Hide YouTube Music behind the window | **UI** button in the title bar. A dark cover sits behind the window. Playback continues |
| Play, pause, stop, previous, next | Transport buttons |
| Seek | Click or drag the seek bar |
| Volume | Drag the volume bar. It sets YouTube Music's own volume |
| Switch elapsed and remaining time | Click the LCD |

The toolbar button and shortcut act on the active tab. They do nothing on other sites.

> **Note:** the installed app window may not show the toolbar button. Use the
> shortcut there, and check it on your setup.

## Architecture

| Layer | File | World | Job |
|---|---|---|---|
| Adapter | `src/bridge/adapter.ts` | MAIN | Every YTM selector and API name. The only file to edit when YTM changes |
| Audio tap | `src/bridge/audio-graph.ts` | MAIN | Routes the media element through an analyser for the spectrum |
| Bridge | `src/bridge/bridge.ts` | MAIN | Emits state and spectrum frames, runs commands |
| Window | `src/content/window.ts` | ISOLATED | Shadow DOM window: controls, LCD, spectrum, drag, 2x, hide-UI cover |
| Content | `src/content/content.ts` | ISOLATED | Relays messages, handles the toggle from the background worker |
| Background | `src/background.ts` | Service worker | Toolbar button and shortcut |
| Protocol | `src/shared/protocol.ts` | both | Message schema and validation (`llamatubemusic:v1`) |
| Settings | `src/shared/settings.ts` | ISOLATED | Position, scale, visibility and hide-UI mode in `chrome.storage.local` |

Messages go over `window.postMessage`. Every message is validated. Commands are
accepted only from `event.source === window`.

### Spectrum

The bridge attaches the media element to an `AudioContext` once it's running.
Audio always goes source → analyser → destination. If the context is suspended,
the bridge does not attach, so the song is never silenced. A click or key press
resumes the context.

## Console commands

Run these in DevTools on `music.youtube.com` (page context, not extension context):

```js
// Pause, play, seek to 30 s, set volume to 40
postMessage({ ns: 'llamatubemusic:v1', kind: 'cmd', payload: { op: 'pause' } }, location.origin);
postMessage({ ns: 'llamatubemusic:v1', kind: 'cmd', payload: { op: 'play' } }, location.origin);
postMessage({ ns: 'llamatubemusic:v1', kind: 'cmd', payload: { op: 'seek', time: 30 } }, location.origin);
postMessage({ ns: 'llamatubemusic:v1', kind: 'cmd', payload: { op: 'volume', value: 40 } }, location.origin);
```

## When YTM changes: fixing the adapter

| Symptom | Fix in `adapter.ts` |
|---|---|
| Track title or artist blank | `SEL.titleDom` / `SEL.artistDom`, or check `navigator.mediaSession.metadata` |
| Play, pause, next or seek do nothing | Player method names in `PlayerApi`, then the DOM fallbacks in `SEL` |
| `ready=false` in the console log | `SEL.player`, `SEL.playerHost` or `SEL.video` |
| Volume reads 0 or goes stale | `getVolume` / `setVolume` on the player |
| Spectrum stays at zero | Check that the `<video>` element is still the audio source, then `audio-graph.ts` |

After any YTM update, run the probe in the checklist to see which surfaces still exist.

## Privacy and security notes

- The extension requests access only to `music.youtube.com`, plus `storage` for your window settings.
- Page scripts can post to `window`, so the bridge treats every inbound message as untrusted.
- The bridge runs in the page's world, so YTM's own scripts can observe it. It holds no secrets.
