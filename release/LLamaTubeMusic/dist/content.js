"use strict";
(() => {
  // src/shared/protocol.ts
  var NS = "llamatubemusic:v1";
  var isObj = (x) => typeof x === "object" && x !== null;
  var isNum = (x) => typeof x === "number" && Number.isFinite(x);
  var isStr = (x) => typeof x === "string";
  var isBool = (x) => typeof x === "boolean";
  function isTrack(x) {
    return isObj(x) && isStr(x.title) && isStr(x.artist) && isStr(x.album) && (x.artwork === null || isStr(x.artwork));
  }
  function isState(x) {
    return isObj(x) && isBool(x.ready) && isBool(x.playing) && isNum(x.currentTime) && isNum(x.duration) && isNum(x.volume) && isBool(x.muted) && isBool(x.shuffle) && (x.track === null || isTrack(x.track));
  }
  function isSpectrum(x) {
    return isObj(x) && Array.isArray(x.bins) && x.bins.length >= 1 && x.bins.length <= 64 && x.bins.every((v) => Number.isInteger(v) && v >= 0 && v <= 255) && isBool(x.silent);
  }
  function isQueue(x) {
    return isObj(x) && isBool(x.available) && Array.isArray(x.items) && x.items.length <= 200 && x.items.every((it) => isObj(it) && isStr(it.title) && isStr(it.artist) && isBool(it.current));
  }
  function isCommand(x) {
    if (!isObj(x) || !isStr(x.op)) return false;
    switch (x.op) {
      case "play":
      case "pause":
      case "toggle":
      case "stop":
      case "next":
      case "prev":
        return true;
      case "seek":
        return isNum(x.time);
      case "volume":
        return isNum(x.value);
      case "playIndex":
        return Number.isInteger(x.index) && x.index >= 0;
      case "queueWatch":
        return isBool(x.on);
      case "videoMode":
      case "shuffle":
        return true;
      default:
        return false;
    }
  }
  function parseMessage(data) {
    if (!isObj(data) || data.ns !== NS || !isStr(data.kind)) return null;
    switch (data.kind) {
      case "hello":
        return { ns: NS, kind: "hello" };
      case "state":
        return isState(data.payload) ? { ns: NS, kind: "state", payload: data.payload } : null;
      case "cmd":
        return isCommand(data.payload) ? { ns: NS, kind: "cmd", payload: data.payload } : null;
      case "spectrum":
        return isSpectrum(data.payload) ? { ns: NS, kind: "spectrum", payload: data.payload } : null;
      case "queue":
        return isQueue(data.payload) ? { ns: NS, kind: "queue", payload: data.payload } : null;
      default:
        return null;
    }
  }
  function post(msg) {
    window.postMessage(msg, window.location.origin);
  }

  // src/content/skin.css
  var skin_default = "/*\n * LLamaTubeMusic skin. Original artwork and CSS only: no Winamp bitmaps.\n * Look and feel are inspired by the classic 2.x main window: grey bevelled\n * chrome, green LCD digits, and a green-on-black track list.\n * Every colour is a token on :host, so another skin can redefine them.\n */\n:host {\n  --llt-face: #3a3d48;\n  --llt-face-hi: #5b5f6e;\n  --llt-face-lo: #22242b;\n  --llt-bevel-hi: #8a8fa0;\n  --llt-bevel-lo: #0a0b0e;\n  --llt-well: #050805;\n  --llt-lcd: #3dff5a;\n  --llt-lcd-dim: #163a1e;\n  --llt-lcd-glow: rgba(61, 255, 90, 0.55);\n  --llt-title-a: #2e3b55;\n  --llt-title-b: #141a28;\n  --llt-title-text: #cfe9ff;\n  --llt-text: #d6d9e3;\n  --llt-muted: #7fa58c;\n  --llt-accent: #9fe3ff;\n\n  all: initial;\n  position: fixed;\n  z-index: 2147483000;\n  font-family: system-ui, sans-serif;\n  color: var(--llt-text);\n  user-select: none;\n}\n\n* {\n  box-sizing: border-box;\n}\n\n/* ---- Window frame ---- */\n.win {\n  position: relative;\n  z-index: 1;\n  width: 275px;\n  height: 116px;\n  background: linear-gradient(180deg, var(--llt-face-hi), var(--llt-face) 45%, var(--llt-face-lo));\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow:\n    inset 1px 1px 0 var(--llt-bevel-hi),\n    inset -1px -1px 0 var(--llt-bevel-lo),\n    inset 2px 2px 0 rgba(255, 255, 255, 0.06),\n    inset -2px -2px 0 rgba(0, 0, 0, 0.35);\n  overflow: hidden;\n}\n\n.win {\n  --pl-h: 120px;\n}\n\n.win {\n  --vd-h: 0px;\n  --pl-extra: 0px;\n  height: calc(116px + var(--vd-h) + var(--pl-extra));\n}\n\n.win.expanded {\n  --pl-extra: var(--pl-h);\n}\n\n/* ---- Title bar (also the drag handle) ---- */\n.titlebar {\n  position: absolute;\n  left: 0;\n  top: 0;\n  width: 275px;\n  height: 14px;\n  display: flex;\n  align-items: center;\n  padding: 0 3px 0 5px;\n  gap: 2px;\n  background:\n    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 3px),\n    linear-gradient(90deg, var(--llt-title-a), var(--llt-title-b));\n  border-bottom: 1px solid var(--llt-bevel-lo);\n  cursor: move;\n  touch-action: none;\n}\n\n.title {\n  flex: 1;\n  font: 700 9px/1 monospace;\n  letter-spacing: 3px;\n  color: var(--llt-title-text);\n  text-shadow: 0 0 4px rgba(159, 227, 255, 0.45);\n  white-space: nowrap;\n}\n\n/* Small grey buttons shared by the title bar and the playlist toggle. */\n.titlebar button,\n.plbtn {\n  font: 700 8px/1 monospace;\n  height: 10px;\n  padding: 0 3px;\n  color: var(--llt-text);\n  background: linear-gradient(180deg, var(--llt-face-hi), var(--llt-face-lo));\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-hi);\n  cursor: pointer;\n}\n\n.titlebar button:active,\n.plbtn:active {\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-lo);\n}\n\n.titlebar button.active,\n.plbtn.active {\n  color: var(--llt-lcd);\n  background: linear-gradient(180deg, var(--llt-lcd-dim), var(--llt-well));\n  text-shadow: 0 0 3px var(--llt-lcd-glow);\n}\n\n.scale,\n.plbtn {\n  width: 22px;\n}\n.hideui {\n  width: 22px;\n}\n.popout {\n  width: 26px;\n}\n.close {\n  width: 14px;\n  font-size: 9px;\n}\n\n/* ---- LCD: time readout and track line ---- */\n.lcd {\n  position: absolute;\n  left: 8px;\n  top: 20px;\n  width: 96px;\n  height: 22px;\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  padding: 0 5px;\n  background: var(--llt-well);\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow: inset 1px 1px 0 rgba(0, 0, 0, 0.6);\n  cursor: pointer;\n}\n\n.time {\n  font: 700 18px/1 monospace;\n  letter-spacing: 1px;\n  color: var(--llt-lcd);\n  text-shadow: 0 0 5px var(--llt-lcd-glow);\n}\n\n.track {\n  position: absolute;\n  left: 8px;\n  top: 46px;\n  width: 259px;\n  height: 12px;\n  overflow: hidden;\n  background: var(--llt-well);\n  border: 1px solid var(--llt-bevel-lo);\n  padding: 0 3px;\n  font: 700 9px/10px monospace;\n  color: var(--llt-lcd);\n  text-shadow: 0 0 3px rgba(61, 255, 90, 0.4);\n  white-space: nowrap;\n}\n\n.marquee {\n  display: inline-block;\n  white-space: nowrap;\n}\n\n.marquee.scroll {\n  animation: llamatubemusic-marquee 12s linear infinite;\n}\n\n@keyframes llamatubemusic-marquee {\n  from {\n    transform: translateX(0);\n  }\n  to {\n    transform: translateX(-50%);\n  }\n}\n\n/* ---- Spectrum analyser ---- */\n.spectrum {\n  position: absolute;\n  left: 112px;\n  top: 20px;\n  width: 155px;\n  height: 22px;\n  display: flex;\n  align-items: flex-end;\n  gap: 1px;\n  padding: 2px;\n  background: var(--llt-well);\n  border: 1px solid var(--llt-bevel-lo);\n}\n\n.spectrum i {\n  flex: 1;\n  background: linear-gradient(0deg, #2fbf57, #d8e84a 65%, #ff5a4a);\n}\n\n.spectrum.silent i {\n  opacity: 0.3;\n}\n\n/* ---- Transport buttons, drawn with CSS ---- */\n.transport {\n  position: absolute;\n  left: 8px;\n  top: 62px;\n  display: flex;\n  gap: 2px;\n}\n\n.btn {\n  position: relative;\n  width: 24px;\n  height: 18px;\n  padding: 0;\n  background: linear-gradient(180deg, var(--llt-face-hi), var(--llt-face-lo));\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-hi);\n  cursor: pointer;\n}\n\n.btn:active {\n  background: var(--llt-face-lo);\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-lo);\n}\n\n.btn.active {\n  background: linear-gradient(180deg, var(--llt-lcd-dim), var(--llt-well));\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-lo);\n}\n\n.btn i {\n  position: absolute;\n  left: 50%;\n  top: 50%;\n  transform: translate(-50%, -50%);\n  width: 0;\n  height: 0;\n}\n\n.prev i {\n  border-style: solid;\n  border-width: 4px 5px 4px 0;\n  border-color: transparent var(--llt-text) transparent transparent;\n  margin-left: -2px;\n}\n\n.play i {\n  border-style: solid;\n  border-width: 4px 0 4px 7px;\n  border-color: transparent transparent transparent var(--llt-lcd);\n  margin-left: 1px;\n}\n\n.pause i {\n  width: 6px;\n  height: 7px;\n  border-left: 2px solid var(--llt-text);\n  border-right: 2px solid var(--llt-text);\n  box-sizing: content-box;\n}\n\n.stop i {\n  width: 7px;\n  height: 7px;\n  background: var(--llt-text);\n}\n\n.next i {\n  border-style: solid;\n  border-width: 4px 0 4px 5px;\n  border-color: transparent transparent transparent var(--llt-text);\n  margin-left: 2px;\n}\n\n/* Shuffle is a text label, not a glyph: it reads as a mode, and its lit state matches the others. */\n.btn.shuf {\n  margin-left: 6px;\n  font: 700 8px/1 sans-serif;\n  letter-spacing: 0.04em;\n  color: var(--llt-text);\n}\n\n/* ---- Seek and volume sliders ---- */\n.seek,\n.volume {\n  position: absolute;\n  height: 6px;\n  background: var(--llt-well);\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow: inset 1px 1px 0 rgba(0, 0, 0, 0.6);\n  cursor: pointer;\n}\n\n.seek {\n  left: 8px;\n  top: 88px;\n  width: 259px;\n}\n\n.volume {\n  left: 146px;\n  top: 66px;\n  width: 121px;\n}\n\n.fill {\n  position: absolute;\n  left: 0;\n  top: 0;\n  bottom: 0;\n}\n\n.seek .fill {\n  width: 0;\n  background: linear-gradient(90deg, #1f7a36, var(--llt-lcd));\n}\n\n.volume .fill {\n  width: 100%;\n  background: linear-gradient(90deg, #1f7a36, var(--llt-lcd) 70%, #d8e84a);\n}\n\n.thumb {\n  position: absolute;\n  top: -4px;\n  width: 5px;\n  height: 12px;\n  background: linear-gradient(180deg, var(--llt-face-hi), var(--llt-face-lo));\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-hi);\n}\n\n.seek .thumb,\n.volume .thumb {\n  left: 0;\n  right: auto;\n}\n\n/* ---- Up-next playlist panel, below the window ---- */\n.playlist {\n  position: absolute;\n  left: 0;\n  top: calc(116px + var(--vd-h));\n  width: 275px;\n  height: var(--pl-h);\n  display: none;\n  overflow-y: auto;\n  padding: 3px 5px;\n  background: var(--llt-well);\n  border-top: 2px solid var(--llt-bevel-lo);\n  font: 9px/12px monospace;\n  color: var(--llt-lcd);\n  text-shadow: 0 0 2px rgba(61, 255, 90, 0.3);\n}\n\n.win.expanded .playlist {\n  display: block;\n}\n\n.pl-row {\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  padding: 0 2px;\n  cursor: pointer;\n}\n\n.pl-row:hover {\n  background: #0d2214;\n}\n\n.pl-row.current {\n  color: #ffffff;\n  font-weight: 700;\n  background: var(--llt-lcd-dim);\n  text-shadow: none;\n}\n\n.pl-empty {\n  white-space: normal;\n  color: var(--llt-muted);\n  padding: 4px 2px;\n}\n\n/* ---- Hide-YTM-UI cover, behind the window ---- */\n.veil {\n  position: fixed;\n  inset: 0;\n  z-index: 0;\n  display: none;\n  background: #07080b;\n}\n\n.veil.on {\n  display: block;\n}\n\n/* Corner grip that resizes the list. */\n.pl-grip {\n  position: absolute;\n  right: 0;\n  bottom: 0;\n  width: 12px;\n  height: 12px;\n  display: none;\n  cursor: nwse-resize;\n  background:\n    linear-gradient(135deg, transparent 0 45%, var(--llt-bevel-hi) 45% 55%, transparent 55% 70%, var(--llt-bevel-hi) 70% 80%, transparent 80%);\n}\n.win.expanded .pl-grip {\n  display: block;\n}\n\n/* Scrollbar in the window's style: a dark well and a bevelled grey thumb. */\n.playlist {\n  scrollbar-width: thin;\n  scrollbar-color: var(--llt-face-hi) var(--llt-well);\n}\n.playlist::-webkit-scrollbar {\n  width: 9px;\n}\n.playlist::-webkit-scrollbar-track {\n  background: var(--llt-well);\n  border-left: 1px solid var(--llt-bevel-lo);\n}\n.playlist::-webkit-scrollbar-thumb {\n  background: linear-gradient(90deg, var(--llt-face-hi), var(--llt-face-lo));\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-hi);\n}\n.playlist::-webkit-scrollbar-thumb:hover {\n  background: linear-gradient(90deg, #6d7284, var(--llt-face));\n}\n\n/* ---- Video panel ---- */\n.vdbtn {\n  font: 700 8px/1 monospace;\n  width: 22px;\n  height: 10px;\n  padding: 0;\n  color: var(--llt-text);\n  background: linear-gradient(180deg, var(--llt-face-hi), var(--llt-face-lo));\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-hi);\n  cursor: pointer;\n}\n.vdbtn.active {\n  color: var(--llt-lcd);\n  background: linear-gradient(180deg, var(--llt-lcd-dim), var(--llt-well));\n}\n.video {\n  position: absolute;\n  left: 0;\n  top: 116px;\n  width: 275px;\n  height: var(--vd-h);\n  display: none;\n  background: #000;\n  border-top: 2px solid var(--llt-bevel-lo);\n}\n.win.video-open .video {\n  display: block;\n}\n.mirror {\n  width: 100%;\n  height: 100%;\n  object-fit: contain;\n  display: block;\n}\n.mirror[hidden] {\n  display: none;\n}\n.vd-empty {\n  position: absolute;\n  inset: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 8px;\n  text-align: center;\n  font: 9px/12px monospace;\n  color: var(--llt-muted);\n}\n.fs {\n  position: absolute;\n  right: 4px;\n  bottom: 4px;\n  font: 700 8px/1 monospace;\n  width: 22px;\n  height: 12px;\n  padding: 0;\n  color: var(--llt-text);\n  background: linear-gradient(180deg, var(--llt-face-hi), var(--llt-face-lo));\n  border: 1px solid var(--llt-bevel-lo);\n  box-shadow: inset 1px 1px 0 var(--llt-bevel-hi);\n  cursor: pointer;\n  opacity: 0.85;\n}\n\n/* The author rule above sets display, so the hidden attribute needs its own rule. */\n.vd-empty[hidden] {\n  display: none;\n}\n\n/* Full-viewport video for the fullscreen view, behind the window. */\n.fsview {\n  position: fixed;\n  inset: 0;\n  z-index: 0;\n  display: none;\n  background: #000;\n}\n\n.fsview.on {\n  display: block;\n}\n\n.fs-mirror {\n  width: 100%;\n  height: 100%;\n  object-fit: contain;\n  display: block;\n}\n";

  // src/shared/settings.ts
  var KEY = "llamatubemusic.settings";
  var MIN_PL_H = 48;
  var MAX_PL_H = 1e3;
  var DEFAULTS = { x: 24, y: 24, scale: 1, visible: true, hideUi: false, plHeight: 120 };
  function sanitize(raw) {
    if (typeof raw !== "object" || raw === null) return {};
    const r = raw;
    const out = {};
    if (typeof r.x === "number" && Number.isFinite(r.x)) out.x = r.x;
    if (typeof r.y === "number" && Number.isFinite(r.y)) out.y = r.y;
    if (r.scale === 1 || r.scale === 2) out.scale = r.scale;
    if (typeof r.visible === "boolean") out.visible = r.visible;
    if (typeof r.hideUi === "boolean") out.hideUi = r.hideUi;
    if (typeof r.plHeight === "number" && Number.isFinite(r.plHeight)) {
      out.plHeight = Math.min(MAX_PL_H, Math.max(MIN_PL_H, r.plHeight));
    }
    return out;
  }
  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get(KEY);
      return { ...DEFAULTS, ...sanitize(stored[KEY]) };
    } catch {
      return { ...DEFAULTS };
    }
  }
  async function saveSettings(settings) {
    try {
      await chrome.storage.local.set({ [KEY]: settings });
    } catch {
    }
  }

  // src/content/window.ts
  var HOST_ID = "llamatubemusic-host";
  var BASE_W = 275;
  var BASE_H = 116;
  var SPECTRUM_BARS = 14;
  var VOLUME_THROTTLE_MS = 60;
  var TEMPLATE = `
  <div class="titlebar" part="titlebar">
    <span class="title">LLAMATUBEMUSIC</span>
    <button class="vdbtn" type="button" title="Video">VD</button>
    <button class="plbtn" type="button" title="Up next">PL</button>
    <button class="popout" type="button" title="Pop out into a separate window">PIP</button>
    <button class="hideui" type="button" title="Hide YouTube Music behind the window">UI</button>
    <button class="scale" type="button" title="Toggle 2x size">2x</button>
    <button class="close" type="button" title="Hide LLamaTubeMusic">\xD7</button>
  </div>
  <div class="lcd" title="Click to switch elapsed and remaining time">
    <span class="time">0:00</span>
  </div>
  <div class="track"><span class="marquee"></span></div>
  <div class="spectrum" aria-hidden="true"></div>
  <div class="transport">
    <button type="button" class="btn prev" title="Previous" data-op="prev"><i></i></button>
    <button type="button" class="btn play" title="Play" data-op="play"><i></i></button>
    <button type="button" class="btn pause" title="Pause" data-op="pause"><i></i></button>
    <button type="button" class="btn stop" title="Stop" data-op="stop"><i></i></button>
    <button type="button" class="btn next" title="Next" data-op="next"><i></i></button>
    <button type="button" class="btn shuf" title="Shuffle" data-op="shuffle">SH</button>
  </div>
  <div class="seek" aria-label="Seek"><div class="fill"></div><div class="thumb"></div></div>
  <div class="volume" aria-label="Volume"><div class="fill"></div><div class="thumb"></div></div>
  <div class="playlist" aria-label="Up next"></div>
  <div class="video" aria-label="Video">
    <video class="mirror" muted playsinline></video>
    <div class="vd-empty">Video not available here.</div>
    <button class="fs" type="button" title="Full screen">FS</button>
  </div>
  <div class="pl-grip" title="Drag to resize the list"></div>
`;
  function sizeOf(scale) {
    return { w: BASE_W * scale, h: BASE_H * scale };
  }
  function clampPosition(x, y, scale) {
    const { w, h } = sizeOf(scale);
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    return { x: Math.min(maxX, Math.max(0, x)), y: Math.min(maxY, Math.max(0, y)) };
  }
  function fmt(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  }
  var debugOn = () => {
    try {
      return sessionStorage.getItem("llamatubemusicDebug") === "1";
    } catch {
      return false;
    }
  };
  var dlog = (...args) => {
    if (debugOn()) console.log("[LLT debug]", ...args);
  };
  async function mountWindow(send) {
    if (document.getElementById(HOST_ID)) return null;
    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = skin_default;
    const win = document.createElement("div");
    win.className = "win";
    win.innerHTML = TEMPLATE;
    const spectrum = win.querySelector(".spectrum");
    if (spectrum) {
      for (let i = 0; i < SPECTRUM_BARS; i++) {
        const bar = document.createElement("i");
        bar.style.height = `${20 + i * 37 % 70}%`;
        spectrum.append(bar);
      }
    }
    const veil = document.createElement("div");
    veil.className = "veil";
    const fsView = document.createElement("div");
    fsView.className = "fsview";
    fsView.innerHTML = '<video class="fs-mirror" muted playsinline></video>';
    shadow.append(style, veil, fsView, win);
    document.documentElement.append(host);
    const q = (sel) => win.querySelector(sel);
    const ui = {
      win,
      host,
      time: q(".time"),
      lcd: q(".lcd"),
      marquee: q(".marquee"),
      trackBox: q(".track"),
      play: q(".btn.play"),
      shuffle: q(".btn.shuf"),
      seek: q(".seek"),
      spectrum: q(".spectrum"),
      volume: q(".volume")
    };
    const settings = await loadSettings();
    applyLayout(host, win, settings);
    wireDrag(host, q(".titlebar"), settings);
    wireScale(host, win, settings, () => {
      if (!pipWin) return;
      try {
        fitPipContent(pipWin, BASE_W * settings.scale, contentHeight() * settings.scale);
      } catch {
        console.warn("[LLamaTubeMusic] Could not resize the popped-out window to the new size.");
      }
    });
    const applyVisibility = () => {
      host.style.display = settings.visible ? "" : "none";
      win.style.display = settings.visible && !win.dataset.fs ? "" : "none";
      veil.classList.toggle("on", settings.visible && settings.hideUi);
      win.querySelector(".hideui")?.classList.toggle("active", settings.hideUi);
    };
    applyVisibility();
    win.querySelector(".hideui")?.addEventListener("click", () => {
      settings.hideUi = !settings.hideUi;
      applyVisibility();
      void saveSettings(settings);
    });
    const remaining = wireLcd(ui);
    wireTransport(win, send);
    const seek = wireSeek(ui, send);
    const volume = wireVolume(ui, send);
    let latest = null;
    ui.lcd.addEventListener("click", () => {
      if (latest) renderTime(ui, latest, remaining.get(), seek.preview());
    });
    const bars = Array.from(ui.spectrum.querySelectorAll("i"));
    const targets = new Array(bars.length).fill(0);
    const levels = new Array(bars.length).fill(0);
    let frame = null;
    const animate = () => {
      let active = false;
      bars.forEach((bar, i) => {
        const t = targets[i];
        levels[i] = t >= levels[i] ? t : Math.max(t, levels[i] * 0.86);
        if (levels[i] > 5e-3) active = true;
        bar.style.height = `${Math.max(4, Math.round(levels[i] * 100))}%`;
      });
      frame = active ? requestAnimationFrame(animate) : null;
    };
    const pipApi = window.documentPictureInPicture;
    const popBtn = win.querySelector(".popout");
    let pipWin = null;
    const popOut = async () => {
      if (pipWin) {
        pipWin.close();
        return;
      }
      if (!pipApi) {
        console.warn("[LLamaTubeMusic] Picture-in-Picture is not available in this browser.");
        return;
      }
      const pip = await pipApi.requestWindow({ width: BASE_W * settings.scale, height: BASE_H * settings.scale });
      const doc = pip.document;
      doc.title = "LLamaTubeMusic";
      doc.body.style.cssText = "margin:0;background:#000;overflow:hidden";
      const pipHost = doc.createElement("div");
      pipHost.style.cssText = "position:fixed;left:0;top:0;margin:0;padding:0";
      doc.body.append(pipHost);
      const pipShadow = pipHost.attachShadow({ mode: "open" });
      const pipStyle = doc.createElement("style");
      pipStyle.textContent = skin_default;
      pipShadow.append(pipStyle, win);
      win.style.zoom = String(settings.scale);
      host.dataset.popped = "true";
      popBtn?.classList.add("active");
      pipWin = pip;
      try {
        fitPipContent(pip, BASE_W * settings.scale, contentHeight() * settings.scale);
      } catch {
        console.warn("[LLamaTubeMusic] The popped-out window opened at the browser's size.");
      }
      pip.addEventListener("resize", () => onPipResized(pip));
      pip.addEventListener("pagehide", () => {
        shadow.append(win);
        win.style.zoom = String(settings.scale);
        delete host.dataset.popped;
        popBtn?.classList.remove("active");
        pipWin = null;
      });
    };
    popBtn?.addEventListener("click", () => {
      void popOut();
    });
    window.addEventListener("pagehide", () => pipWin?.close());
    win.querySelector(".close")?.addEventListener("click", () => {
      settings.visible = false;
      applyVisibility();
      void saveSettings(settings);
      pipWin?.close();
    });
    const plBtn = win.querySelector(".plbtn");
    const plist = win.querySelector(".playlist");
    let playlistOpen = false;
    const setPlaylistOpen = (open) => {
      dlog("PL toggle ->", open, "video open:", videoOpen);
      playlistOpen = open;
      win.classList.toggle("expanded", open);
      plBtn?.classList.toggle("active", open);
      send({ op: "queueWatch", on: open });
      if (pipWin) {
        try {
          fitPipContent(pipWin, BASE_W * settings.scale, contentHeight() * settings.scale);
        } catch {
          console.warn("[LLamaTubeMusic] Could not resize the popped-out window.");
        }
      }
    };
    plBtn?.addEventListener("click", () => setPlaylistOpen(!playlistOpen));
    plist.addEventListener("click", (e) => {
      const row = e.target.closest("[data-index]");
      if (row) send({ op: "playIndex", index: Number(row.dataset.index) });
    });
    const renderQueue = (snapshot) => {
      plist.replaceChildren();
      if (!snapshot.available) {
        const note = document.createElement("div");
        note.className = "pl-empty";
        note.textContent = "Queue not found in YouTube Music. Open the queue panel there, then try again.";
        plist.append(note);
        return;
      }
      if (snapshot.items.length === 0) {
        const note = document.createElement("div");
        note.className = "pl-empty";
        note.textContent = "The queue is empty.";
        plist.append(note);
        return;
      }
      snapshot.items.forEach((item, i) => {
        const row = document.createElement("div");
        row.className = item.current ? "pl-row current" : "pl-row";
        row.dataset.index = String(i);
        row.textContent = `${i + 1}. ${item.artist ? item.artist + " - " : ""}${item.title}`;
        plist.append(row);
      });
    };
    const grip = win.querySelector(".pl-grip");
    win.style.setProperty("--pl-h", `${settings.plHeight}px`);
    let resizing = null;
    const fitPipContent = (p, contentW, contentH) => {
      const frameW = p.outerWidth - p.innerWidth;
      const frameH = p.outerHeight - p.innerHeight;
      p.resizeTo(contentW + frameW, contentH + frameH);
    };
    const maxPlHeight = () => {
      if (pipWin) return MAX_PL_H;
      const hostTop = host.getBoundingClientRect().top;
      return Math.min(MAX_PL_H, (window.innerHeight - hostTop) / settings.scale - BASE_H - (videoOpen ? VIDEO_H : 0));
    };
    const setPlHeight = (h) => {
      settings.plHeight = h;
      win.style.setProperty("--pl-h", `${h}px`);
      if (pipWin) fitPipContent(pipWin, BASE_W * settings.scale, contentHeight() * settings.scale);
      void saveSettings(settings);
    };
    const onPipResized = (p) => {
      const s = settings.scale;
      const minW = BASE_W * s;
      const minH = (BASE_H + (videoOpen ? VIDEO_H : 0) + (playlistOpen ? MIN_PL_H : 0)) * s;
      if (p.innerWidth < minW - 0.5 || p.innerHeight < minH - 0.5) {
        fitPipContent(p, Math.max(p.innerWidth, minW), Math.max(p.innerHeight, minH));
        return;
      }
      if (playlistOpen) {
        const h = Math.round(p.innerHeight / s - BASE_H - (videoOpen ? VIDEO_H : 0));
        if (h !== settings.plHeight) {
          settings.plHeight = h;
          win.style.setProperty("--pl-h", `${h}px`);
          void saveSettings(settings);
        }
      }
    };
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      resizing = { startY: e.clientY, startH: settings.plHeight };
      grip.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });
    grip.addEventListener("pointermove", (e) => {
      if (!resizing) return;
      const dy = (e.clientY - resizing.startY) / settings.scale;
      const h = Math.round(Math.min(Math.max(resizing.startH + dy, MIN_PL_H), maxPlHeight()));
      win.style.setProperty("--pl-h", `${h}px`);
    });
    const finishResize = (e) => {
      if (!resizing) return;
      const dy = (e.clientY - resizing.startY) / settings.scale;
      const h = Math.round(Math.min(Math.max(resizing.startH + dy, MIN_PL_H), maxPlHeight()));
      resizing = null;
      setPlHeight(h);
    };
    grip.addEventListener("pointerup", finishResize);
    grip.addEventListener("pointercancel", () => {
      resizing = null;
      win.style.setProperty("--pl-h", `${settings.plHeight}px`);
    });
    const VIDEO_H = 155;
    const vdBtn = win.querySelector(".vdbtn");
    const mirror = win.querySelector(".mirror");
    const vdEmpty = win.querySelector(".vd-empty");
    const fsBtn = win.querySelector(".fs");
    let videoOpen = false;
    const contentHeight = () => BASE_H + (videoOpen ? VIDEO_H : 0) + (playlistOpen ? settings.plHeight : 0);
    const SWITCH_TIMEOUT_MS = 6e3;
    let switchPending = null;
    const songKey = () => {
      const md = navigator.mediaSession?.metadata;
      return md ? `${md.title}|${md.artist}` : "";
    };
    const clearSwitch = () => {
      if (!switchPending) return;
      window.clearTimeout(switchPending.timer);
      switchPending = null;
    };
    const giveUpSwitch = () => {
      switchPending = null;
      vdEmpty.textContent = "Video is not available for this song.";
    };
    const attachMirror = () => {
      const source = document.querySelector("video");
      dlog("attachMirror", {
        hasSource: !!source,
        videoWidth: source?.videoWidth ?? null,
        pending: switchPending ? "yes" : "no",
        key: songKey()
      });
      if (!source || source.videoWidth === 0) {
        if (switchPending && (switchPending.key !== songKey() || switchPending.src !== (source?.currentSrc ?? ""))) {
          clearSwitch();
        }
        if (source && !switchPending) {
          switchPending = {
            time: source.currentTime,
            key: songKey(),
            src: source.currentSrc,
            timer: window.setTimeout(giveUpSwitch, SWITCH_TIMEOUT_MS)
          };
          dlog("requesting video mode");
          send({ op: "videoMode" });
        }
        mirror.hidden = true;
        vdEmpty.hidden = false;
        vdEmpty.textContent = switchPending ? "Switching to the video..." : "No video for this song.";
        return;
      }
      if (typeof source.captureStream !== "function") {
        mirror.hidden = true;
        vdEmpty.hidden = false;
        vdEmpty.textContent = "Video not available here.";
        return;
      }
      try {
        mirror.srcObject = source.captureStream();
        if (fullscreenView) fsMirror.srcObject = mirror.srcObject;
        mirror.hidden = false;
        vdEmpty.hidden = true;
        void mirror.play().catch(() => void 0);
        if (switchPending) {
          const { time, key } = switchPending;
          clearSwitch();
          if (key === songKey() && Math.abs(source.currentTime - time) > 1) {
            send({ op: "seek", time });
          }
        }
      } catch {
        mirror.hidden = true;
        vdEmpty.hidden = false;
        vdEmpty.textContent = "Video not available here.";
      }
    };
    const setVideoOpen = (open) => {
      dlog("VD toggle ->", open, "list open:", playlistOpen);
      videoOpen = open;
      win.classList.toggle("video-open", open);
      vdBtn?.classList.toggle("active", open);
      win.style.setProperty("--vd-h", open ? `${VIDEO_H}px` : "0px");
      if (open) {
        attachMirror();
      } else {
        if (mirror.ownerDocument.fullscreenElement) void mirror.ownerDocument.exitFullscreen();
        if (fullscreenView) setFullscreenView(false);
        clearSwitch();
        mirror.pause();
        mirror.srcObject = null;
      }
      if (pipWin) {
        try {
          fitPipContent(pipWin, BASE_W * settings.scale, contentHeight() * settings.scale);
        } catch {
          console.warn("[LLamaTubeMusic] Could not resize the popped-out window.");
        }
      }
    };
    vdBtn?.addEventListener("click", () => setVideoOpen(!videoOpen));
    for (const type of ["loadedmetadata", "emptied"]) {
      document.addEventListener(type, () => {
        if (videoOpen) attachMirror();
      }, true);
    }
    let fullscreenView = false;
    const fsOverlay = shadow.querySelector(".fsview");
    const fsMirror = fsView.querySelector(".fs-mirror");
    let wasPopped = false;
    const askWindow = (want) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        return Promise.resolve({ before: null, after: null });
      }
      return chrome.runtime.sendMessage({ type: "llamatubemusic:window", want }).catch(() => ({ before: null, after: null }));
    };
    const setFullscreenView = (on, syncWindow = true) => {
      if (on && !videoOpen) setVideoOpen(true);
      fullscreenView = on;
      win.dataset.fs = on ? "1" : "";
      applyVisibility();
      if (on && pipWin) {
        wasPopped = true;
        pipWin.close();
      } else if (!on && wasPopped) {
        wasPopped = false;
        popOut().catch(() => console.warn("[LLamaTubeMusic] Could not reopen the popped-out window."));
      }
      fsOverlay.classList.toggle("on", on);
      fsMirror.srcObject = on ? mirror.srcObject : null;
      if (on) void fsMirror.play().catch(() => void 0);
      if (syncWindow) void askWindow(on ? "fullscreen" : "normal");
    };
    fsBtn?.addEventListener("click", () => {
      void askWindow("toggle").then((reply) => {
        setFullscreenView(reply?.before !== "fullscreen", false);
      });
    });
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (!fullscreenView) return;
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        void askWindow("state").then((reply) => {
          if (fullscreenView && reply?.before != null && reply.before !== "fullscreen") {
            setFullscreenView(false, false);
          }
        });
      }, 200);
    });
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && fullscreenView) setFullscreenView(false);
      },
      true
    );
    const titlebar = win.querySelector(".titlebar");
    titlebar?.addEventListener("click", (e) => {
      if (!debugOn()) return;
      const rect = (sel) => {
        const r = win.querySelector(sel)?.getBoundingClientRect();
        return r ? [Math.round(r.left), Math.round(r.right)] : null;
      };
      const under = shadow.elementFromPoint(e.clientX, e.clientY);
      dlog("title click at", Math.round(e.clientX), {
        target: e.target.className,
        under: under?.className ?? null,
        vdSpan: rect(".vdbtn"),
        plSpan: rect(".plbtn"),
        popOutSpan: rect(".popout")
      });
    });
    return {
      queue(snapshot) {
        if (playlistOpen) renderQueue(snapshot);
      },
      toggleVisible() {
        settings.visible = !settings.visible;
        applyVisibility();
        if (!settings.visible) pipWin?.close();
        void saveSettings(settings);
      },
      spectrum(bins, silent) {
        const per = bins.length / bars.length;
        for (let i = 0; i < bars.length; i++) {
          const from = Math.floor(i * per);
          const to = Math.max(from + 1, Math.floor((i + 1) * per));
          let sum = 0;
          for (let j = from; j < to; j++) sum += bins[j];
          targets[i] = sum / (to - from) / 255;
        }
        ui.spectrum.classList.toggle("silent", silent);
        ui.spectrum.title = silent ? "No audio signal" : "";
        if (frame === null) frame = requestAnimationFrame(animate);
      },
      update(state) {
        latest = state;
        lastDuration = state.duration;
        renderTime(ui, state, remaining.get(), seek.preview());
        renderTrack(ui, state);
        ui.play.classList.toggle("active", state.playing);
        ui.shuffle.classList.toggle("active", state.shuffle);
        ui.shuffle.title = state.shuffle ? "Shuffle: on" : "Shuffle: off";
        if (!seek.dragging()) renderSeek(ui, state);
        if (!volume.dragging()) renderVolume(ui, state.volume);
      }
    };
  }
  function applyLayout(host, win, settings) {
    win.style.zoom = String(settings.scale);
    const pos = clampPosition(settings.x, settings.y, settings.scale);
    host.style.left = `${pos.x}px`;
    host.style.top = `${pos.y}px`;
  }
  function wireDrag(host, handle, settings) {
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("button")) return;
      if (host.dataset.popped) return;
      dragging = true;
      const rect = host.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const pos = clampPosition(e.clientX - offsetX, e.clientY - offsetY, settings.scale);
      host.style.left = `${pos.x}px`;
      host.style.top = `${pos.y}px`;
    });
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      const rect = host.getBoundingClientRect();
      settings.x = rect.left;
      settings.y = rect.top;
      void saveSettings(settings);
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    window.addEventListener("resize", () => {
      const pos = clampPosition(parseFloat(host.style.left), parseFloat(host.style.top), settings.scale);
      host.style.left = `${pos.x}px`;
      host.style.top = `${pos.y}px`;
    });
  }
  function wireScale(host, win, settings, onChange) {
    win.querySelector(".scale")?.addEventListener("click", () => {
      const next = settings.scale === 1 ? 2 : 1;
      settings.scale = next;
      win.style.zoom = String(next);
      const pos = clampPosition(parseFloat(host.style.left), parseFloat(host.style.top), next);
      host.style.left = `${pos.x}px`;
      host.style.top = `${pos.y}px`;
      settings.x = pos.x;
      settings.y = pos.y;
      void saveSettings(settings);
      onChange();
    });
  }
  function wireLcd(ui) {
    let showRemaining = false;
    ui.lcd.addEventListener("click", () => {
      showRemaining = !showRemaining;
      ui.lcd.classList.toggle("remaining", showRemaining);
    });
    return { get: () => showRemaining };
  }
  function wireTransport(win, send) {
    win.querySelectorAll(".btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const op = btn.dataset.op;
        if (op) send({ op });
      });
    });
  }
  function wireSeek(ui, send) {
    let dragging = false;
    let previewTime = null;
    const fractionOf = (e) => {
      const rect = ui.seek.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    };
    ui.seek.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      ui.seek.setPointerCapture(e.pointerId);
      previewTime = null;
      e.preventDefault();
    });
    ui.seek.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const f = fractionOf(e);
      previewTime = f * (lastDuration || 0);
      setSeekBar(ui, f);
      ui.time.textContent = fmt(previewTime);
    });
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      const f = fractionOf(e);
      if (lastDuration > 0) send({ op: "seek", time: f * lastDuration });
      previewTime = null;
    };
    ui.seek.addEventListener("pointerup", finish);
    ui.seek.addEventListener("pointercancel", () => {
      dragging = false;
      previewTime = null;
    });
    return { dragging: () => dragging, preview: () => previewTime };
  }
  var lastDuration = 0;
  function wireVolume(ui, send) {
    let dragging = false;
    let lastSentAt = 0;
    let lastSentValue = null;
    const valueOf = (e) => {
      const rect = ui.volume.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      return Math.round(f * 100);
    };
    const apply = (e, force) => {
      const value = valueOf(e);
      renderVolume(ui, value);
      if (value === lastSentValue) return;
      const now = performance.now();
      if (force || now - lastSentAt >= VOLUME_THROTTLE_MS) {
        lastSentAt = now;
        lastSentValue = value;
        send({ op: "volume", value });
      }
    };
    ui.volume.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      ui.volume.setPointerCapture(e.pointerId);
      apply(e, true);
      e.preventDefault();
    });
    ui.volume.addEventListener("pointermove", (e) => {
      if (dragging) apply(e, false);
    });
    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      apply(e, true);
    };
    ui.volume.addEventListener("pointerup", finish);
    ui.volume.addEventListener("pointercancel", () => {
      dragging = false;
    });
    return { dragging: () => dragging, preview: () => null };
  }
  function setSeekBar(ui, fraction) {
    const pct = `${fraction * 100}%`;
    ui.seek.querySelector(".fill").style.width = pct;
    ui.seek.querySelector(".thumb").style.left = `calc(${pct} - 3px)`;
  }
  function renderSeek(ui, state) {
    const f = state.duration > 0 ? state.currentTime / state.duration : 0;
    setSeekBar(ui, Math.min(1, Math.max(0, f)));
  }
  function renderVolume(ui, volume) {
    const pct = `${Math.min(100, Math.max(0, volume))}%`;
    ui.volume.querySelector(".fill").style.width = pct;
    ui.volume.querySelector(".thumb").style.left = `calc(${pct} - 3px)`;
  }
  function renderTime(ui, state, showRemaining, preview) {
    if (preview !== null) return;
    if (!state.ready) {
      ui.time.textContent = "0:00";
      return;
    }
    ui.time.textContent = showRemaining ? `-${fmt(Math.max(0, state.duration - state.currentTime))}` : fmt(state.currentTime);
  }
  function renderTrack(ui, state) {
    const text = !state.ready ? "Open a song in YouTube Music" : state.track ? `${state.track.artist} - ${state.track.title}` : "Not playing";
    if (ui.marquee.dataset.text === text) return;
    ui.marquee.dataset.text = text;
    ui.marquee.textContent = `${text}     ${text}     `;
    ui.marquee.classList.toggle("scroll", ui.marquee.scrollWidth > ui.trackBox.clientWidth);
  }

  // src/content/content.ts
  if (!window.__llamatubemusicContent) {
    let log = function(state) {
      const track = state.track ? `${state.track.artist} - ${state.track.title}` : "(no track)";
      const seeked = !!prev && Math.abs(state.currentTime - prev.currentTime) > 2;
      const changed = !prev || seeked || prev.playing !== state.playing || prev.volume !== state.volume || prev.muted !== state.muted || prev.track?.title !== state.track?.title || prev.track?.artist !== state.track?.artist || prev.ready !== state.ready;
      if (changed) {
        const label = seeked ? "SEEK " : state.playing ? "PLAY " : "PAUSE";
        console.log(
          `[LLamaTubeMusic] ${label} | ${track} | ${fmt2(state.currentTime)} / ${fmt2(state.duration)} | vol ${state.volume}${state.muted ? " (muted)" : ""} | ready=${state.ready}`
        );
      }
      prev = state;
    };
    log2 = log;
    window.__llamatubemusicContent = true;
    let prev = null;
    const fmt2 = (s) => {
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60).toString().padStart(2, "0");
      return `${m}:${sec}`;
    };
    window.addEventListener("message", (e) => {
      if (e.source !== window) return;
      const msg = parseMessage(e.data);
      if (msg?.kind === "state") log(msg.payload);
    });
    const send = (cmd) => post({ ns: NS, kind: "cmd", payload: cmd });
    let handle = null;
    let latest = null;
    void mountWindow(send).then((h) => {
      handle = h;
      if (h && latest) h.update(latest);
    });
    window.addEventListener("message", (e) => {
      if (e.source !== window) return;
      const msg = parseMessage(e.data);
      if (msg?.kind === "queue") {
        handle?.queue(msg.payload);
        return;
      }
      if (msg?.kind === "spectrum") {
        handle?.spectrum(msg.payload.bins, msg.payload.silent);
        return;
      }
      if (msg?.kind !== "state") return;
      latest = msg.payload;
      handle?.update(msg.payload);
    });
    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === "llamatubemusic:toggle") handle?.toggleVisible();
      });
    }
    post({ ns: NS, kind: "hello" });
    console.log("[LLamaTubeMusic] content script loaded (Phase 3: controls wired)");
  }
  var log2;
})();
