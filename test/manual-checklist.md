# LLamaTubeMusic manual test checklist

Run on a fresh build: `npm run build`, then reload the extension and `music.youtube.com`.
Open DevTools → Console. Filter for `[LLamaTubeMusic]`.

## Phase 1: bridge and state sync (console only)

| # | Action | Expected in console |
|---|---|---|
| 1.1 | Load a page, and a song is already playing | `[LLamaTubeMusic] content script loaded` then one line with the correct track |
| 1.2 | Press play or pause in YTM | Line shows `PLAY` or `PAUSE` |
| 1.3 | Change the track, using next or from the queue | New `Artist - Title` line within about 1 s |
| 1.4 | Drag the seek bar | Time jumps and the new position is logged |
| 1.5 | Change the volume slider in YTM | `vol` value matches the slider |
| 1.6 | Mute in YTM | `(muted)` appears |
| 1.7 | Press media keys, or use the OS media controls | Same log lines as the buttons |
| 1.8 | Paste the console commands from README | Matching YTM response: pause, play, seek, volume |
| 1.9 | Navigate in-app: Home → Library → Search → back | No duplicate `content script loaded` line, and no errors |
| 1.10 | Open the installed YTM PWA window | Same logs as the browser tab |
| 1.11 | Start cast or connect on another device | Local log shows `PAUSE` or stops updating. Record what happens |

## Probe (once, before Phase 2)

Run the probe snippet from the design thread in DevTools while a song plays, and
record: which `playerApiMethods` exist, whether `videoCrossOrigin` is null,
and whether `mediaSession.metadata` is non-null.

## Known limitations at Phase 1

- Nothing is visible on the page yet. Use the console.
- Volume and seek are controlled through the player API only. There is no DOM fallback yet.
