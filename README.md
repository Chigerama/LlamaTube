# LLamaTubeMusic

A Winamp-style overlay for YouTube Music. It controls YouTube Music and doesn't replace it.

## Install

The easiest way is the release zip:

1. Download [LLamaTubeMusic.zip](https://github.com/Chigerama/LlamaTube/raw/main/release/LLamaTubeMusic.zip), and unzip it. Keep the unzipped folder somewhere permanent, because Chrome reads the extension from it.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**, then select the **LLamaTubeMusic** folder. It's the folder containing `manifest.json`.
5. Open or reload [music.youtube.com](https://music.youtube.com).

The window appears at the top left of the page.

## Using it

| Action | How |
|---|---|
| Show or hide the window | Toolbar button, or **Alt+Shift+L** |
| Move the window | Drag the title bar |
| Double the size | **2x** button |
| Hide YouTube Music behind the window | **UI** button |
| Pop out into its own window | **PIP** button |
| Show the up-next list | **PL** button |
| Show the video | **VD** button (switches to video when the song has one) |
| Full screen video | **FS** button in the video panel, or Escape to exit |
| Play, pause, skip, seek, volume | The window's controls |

## Updating

Download the new zip, unzip it over the same folder, then click the reload icon on the extension's card in `chrome://extensions`.

## Notes

- Chrome shows a warning that the extension is in developer mode. That's expected for an unpacked extension.
- Requires Chrome 116 or newer for the pop-out window.

## Development

```bash
npm install
npm run typecheck
npm run build        # writes dist/bridge.js, dist/content.js and dist/background.js
```

Then load the repo folder with **Load unpacked**, as above. After each rebuild, reload the extension and the YouTube Music tab.

### Architecture

| Layer | File | World | Job |
|---|---|---|---|
| Adapter | `src/bridge/adapter.ts` | MAIN | Every YouTube Music selector and API name. The only file to edit when YouTube Music changes |
| Audio tap | `src/bridge/audio-graph.ts` | MAIN | Routes the video through an analyser for the spectrum |
| Bridge | `src/bridge/bridge.ts` | MAIN | Sends state and spectrum frames, runs commands |
| Window | `src/content/window.ts` | ISOLATED | Shadow DOM window: controls, LCD, spectrum, panels |
| Content | `src/content/content.ts` | ISOLATED | Relays messages between the bridge and the window |
| Background | `src/background.ts` | Service worker | Toolbar button, shortcut, and window fullscreen |
| Protocol | `src/shared/protocol.ts` | both | Message schema and validation |
| Settings | `src/shared/settings.ts` | ISOLATED | Position, scale, visibility and panel sizes |

Testing checklist: `test/manual-checklist.md`.

### When YouTube Music changes

Fix `src/bridge/adapter.ts`. If the track name is wrong, check `SEL.titleDom` and `SEL.artistDom`. If playback controls stop working, check the player method names in `PlayerApi`, and the button selectors in `SEL`. If the spectrum goes silent, check the video element and then `audio-graph.ts`.

### Release

`release/LLamaTubeMusic.zip` and the unzipped `release/LLamaTubeMusic/` folder are built from `main`. Rebuild them after changing the extension, then update both.
