# LLamaTubeMusic manual test checklist

Build with `npm run build`, then reload the extension in `chrome://extensions` and reload `music.youtube.com`.
Open DevTools → Console and filter for `[LLamaTubeMusic]`.

## Phase 1: bridge and state sync (console)

| # | Action | Expected |
|---|---|---|
| 1.1 | Load a page with a song playing | `content script loaded`, then one line with the correct track |
| 1.2 | Pause and play with YTM's buttons | `PAUSE` / `PLAY` lines |
| 1.3 | Change track | New `Artist - Title` line within about 1 s |
| 1.4 | Seek with the seek bar | `SEEK` line with the new position |
| 1.5 | Change the volume slider | `vol` matches the slider |
| 1.6 | Mute | `(muted)` appears |
| 1.7 | Media keys | Same lines as the buttons |
| 1.8 | Paste the four console commands from the README | Pause, play, seek and volume all take effect |
| 1.9 | Navigate: Home → Library → Search → back | No duplicate `content script loaded`, no errors |
| 1.10 | Open the installed YTM app window | Same logs and window appear there |
| 1.11 | Start cast or connect on another device | Record what the local log does. Not verified |

## Phase 2: window

| # | Action | Expected |
|---|---|---|
| 2.1 | Load the page | The window appears at the top-left, 275×116 |
| 2.2 | Drag the title bar, then reload | The window reopens where you left it |
| 2.3 | Click 2x, then again | Doubles, then restores |
| 2.4 | Drag past the edge of the browser window | The window stops at the edge |
| 2.5 | Navigate around YTM | The window stays in place and does not duplicate |

## Phase 3: controls

| # | Action | Expected |
|---|---|---|
| 3.1 | Previous, play, pause, stop, next | Each takes effect in YTM |
| 3.2 | Click and drag the seek bar | Playback moves to the position |
| 3.3 | Drag the volume bar | YTM's own volume changes to match |
| 3.4 | Click the LCD | Switches between elapsed and remaining time, even when paused |
| 3.5 | Track name longer than the box | Scrolls. Short names stay still |

## Phase 4: spectrum

| # | Action | Expected |
|---|---|---|
| 4.1 | Play | Bars move with the music |
| 4.2 | Pause | Bars fall to the floor |
| 4.3 | Skip to the next track | Bars keep moving |
| 4.4 | Listen throughout | Song stays audible. **If it goes silent, that's the most serious failure** |
| 4.5 | Reload, then play | Bars move again |

## Phase 5: show, hide, and hide-UI

| # | Action | Expected |
|---|---|---|
| 5.1 | Click the toolbar button | Window hides. Click again and it shows |
| 5.2 | Press Alt+Shift+L | Same as the toolbar button |
| 5.3 | Press the toolbar button or shortcut on a non-YTM tab | Nothing happens, and no errors appear |
| 5.4 | Click the **UI** button | A dark cover hides YTM. The window stays on top. Playback continues |
| 5.5 | Click **UI** again | YTM is visible again |
| 5.6 | Turn hide-UI on, then hide the window | Both are hidden. Showing it again restores the cover |
| 5.7 | Reload the page with hide-UI on | Hide-UI state is restored |
| 5.8 | Open the YTM app window | Toolbar button may not appear. The shortcut should still work. Record what happens |

## Probe (after any YTM update)

Run this in the console while a song plays, and check which surfaces still exist:

```js
(() => {
  const mp = document.querySelector('#movie_player');
  const v = document.querySelector('video');
  return {
    moviePlayer: !!mp,
    playerApiMethods: mp ? ['playVideo','pauseVideo','nextVideo','previousVideo','seekTo','getCurrentTime','getDuration','getVolume','setVolume'].filter(m => typeof mp[m] === 'function') : [],
    videos: document.querySelectorAll('video').length,
    videoSrcPrefix: v ? (v.currentSrc || '').slice(0, 12) : null,
    mediaSessionTitle: navigator.mediaSession.metadata && navigator.mediaSession.metadata.title,
    nextButton: !!document.querySelector('.next-button'),
  };
})();
```

## Known limits

- Cast takeover: not verified.
- The shortcut and toolbar in the installed app window depend on Chrome, so record what you see.
- The spectrum stays at zero until the audio context is running. A click or key press starts it.
