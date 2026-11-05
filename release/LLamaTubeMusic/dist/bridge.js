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
    return isObj(x) && isBool(x.ready) && isBool(x.playing) && isNum(x.currentTime) && isNum(x.duration) && isNum(x.volume) && isBool(x.muted) && (x.track === null || isTrack(x.track));
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

  // src/bridge/adapter.ts
  var SEL = {
    player: "#movie_player",
    playerHost: "ytmusic-player",
    video: "video",
    titleDom: "ytmusic-player-bar .title",
    artistDom: "ytmusic-player-bar .byline",
    playPause: "#play-pause-button",
    next: ".next-button",
    prev: ".previous-button"
  };
  var PLAYER_MARKERS = ["playVideo", "pauseVideo", "seekTo"];
  var clip = (s, max = 300) => s.slice(0, max);
  var clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  function text(selector) {
    return document.querySelector(selector)?.textContent?.trim() ?? "";
  }
  function findVideo() {
    return document.querySelector(SEL.video);
  }
  function findPlayer() {
    const hostApi = document.querySelector(SEL.playerHost)?.playerApi;
    const candidates = [document.querySelector(SEL.player), hostApi];
    for (const c of candidates) {
      if (c && typeof c === "object" && PLAYER_MARKERS.some((m) => typeof c[m] === "function")) {
        return c;
      }
    }
    return null;
  }
  function barTrack() {
    const title = text(SEL.titleDom);
    if (!title) return null;
    return { title: clip(title), artist: clip(text(SEL.artistDom)) };
  }
  function readTrack() {
    const md = navigator.mediaSession?.metadata;
    if (md && md.title) {
      const art = md.artwork.length ? md.artwork[md.artwork.length - 1].src : null;
      return {
        title: clip(md.title),
        artist: clip(md.artist ?? ""),
        album: clip(md.album ?? ""),
        artwork: art
      };
    }
    const bar = barTrack();
    if (bar) return { title: bar.title, artist: bar.artist, album: "", artwork: null };
    return null;
  }
  function isPlaying() {
    const video = findVideo();
    if (video) return !video.paused && !video.ended;
    return navigator.mediaSession?.playbackState === "playing";
  }
  function readState() {
    const video = findVideo();
    const player = findPlayer();
    const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
    const currentTime = video ? finite(video.currentTime, 0) : finite(player?.getCurrentTime?.() ?? 0, 0);
    const duration = video ? finite(video.duration, 0) : finite(player?.getDuration?.() ?? 0, 0);
    const volume = player?.getVolume ? finite(player.getVolume(), 0) : video ? finite(video.volume * 100, 0) : 0;
    return {
      ready: !!(video || player),
      playing: isPlaying(),
      currentTime: Math.max(0, currentTime),
      duration: Math.max(0, duration),
      volume: clamp(volume, 0, 100),
      muted: video?.muted ?? false,
      track: readTrack()
    };
  }
  function click(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.click();
    return true;
  }
  function runCommand(cmd) {
    const player = findPlayer();
    switch (cmd.op) {
      case "play":
        if (isPlaying()) return true;
        if (player?.playVideo) return player.playVideo(), true;
        return click(SEL.playPause);
      case "pause":
        if (!isPlaying()) return true;
        if (player?.pauseVideo) return player.pauseVideo(), true;
        return click(SEL.playPause);
      case "toggle":
        return runCommand({ op: isPlaying() ? "pause" : "play" });
      case "stop":
        runCommand({ op: "pause" });
        if (!player?.seekTo) return false;
        player.seekTo(0, true);
        return true;
      case "next":
        if (pressSelector(SEL.next)) return true;
        if (player?.nextVideo) return player.nextVideo(), true;
        return false;
      case "prev":
        if (pressSelector(SEL.prev)) return true;
        if (player?.previousVideo) return player.previousVideo(), true;
        return false;
      case "seek":
        if (!player?.seekTo) return false;
        player.seekTo(Math.max(0, cmd.time), true);
        return true;
      case "playIndex":
        return playQueueIndex(cmd.index);
      case "queueWatch":
        return true;
      // handled by the bridge, which owns the watch timer
      case "videoMode":
        return clickVideoMode();
      case "volume":
        if (!player?.setVolume) return false;
        player.setVolume(clamp(Math.round(cmd.value), 0, 100));
        return true;
    }
  }
  var QUEUE = {
    item: "ytmusic-player-queue-item",
    title: ".song-title",
    byline: ".byline",
    play: "ytmusic-play-button-renderer"
  };
  function queueRows() {
    const all = Array.from(document.querySelectorAll(QUEUE.item));
    const shown = all.filter((row) => row.offsetParent !== null);
    return shown.length > 0 ? shown : all;
  }
  function rowVideoId(row) {
    const id = row.data?.videoId;
    return typeof id === "string" ? id : null;
  }
  function currentVideoId() {
    const player = findPlayer();
    const id = player?.getVideoData?.()?.video_id;
    return typeof id === "string" ? id : null;
  }
  function readQueue() {
    const rows = queueRows();
    if (rows.length === 0) return { available: false, items: [] };
    const playingId = currentVideoId();
    const bar = barTrack();
    const barMatch = (row) => {
      if (!bar) return null;
      const title = clip(row.querySelector(QUEUE.title)?.textContent?.trim() ?? "");
      const artist = clip(row.querySelector(QUEUE.byline)?.textContent?.trim() ?? "");
      return title === bar.title && artist === bar.artist;
    };
    const items = rows.slice(0, 200).map((row) => ({
      title: clip(row.querySelector(QUEUE.title)?.textContent?.trim() ?? ""),
      artist: clip(row.querySelector(QUEUE.byline)?.textContent?.trim() ?? ""),
      // Match by video ID when both sides have one. The "selected" attribute can point at a
      // different row than the one playing, so it is only a fallback.
      current: playingId !== null && rowVideoId(row) !== null ? rowVideoId(row) === playingId : barMatch(row) ?? (row.hasAttribute("selected") || row.classList.contains("selected"))
    }));
    return { available: true, items };
  }
  function playQueueIndex(index) {
    const row = queueRows()[index];
    if (!row) return false;
    pressElement(row.querySelector(QUEUE.play) ?? row.querySelector(QUEUE.title) ?? row);
    return true;
  }
  function pressElement(el) {
    const init = { bubbles: true, cancelable: true, composed: true, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, pointerType: "mouse" }));
    el.dispatchEvent(new MouseEvent("mousedown", init));
    el.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, pointerType: "mouse" }));
    el.dispatchEvent(new MouseEvent("mouseup", init));
    el.dispatchEvent(new MouseEvent("click", init));
  }
  var VIDEO_MODE = "ytmusic-av-toggle .video-button";
  function clickVideoMode() {
    const button = document.querySelector(VIDEO_MODE);
    if (!button) return false;
    const debug = (() => {
      try {
        return sessionStorage.getItem("llamatubemusicDebug") === "1";
      } catch {
        return false;
      }
    })();
    const snapshot = (label) => {
      if (!debug) return;
      const toggle = document.querySelector("ytmusic-av-toggle");
      const video = document.querySelector("video");
      console.log("[LLT debug] video mode", label, {
        playbackMode: toggle?.getAttribute("playback-mode") ?? null,
        videoSelected: toggle?.getAttribute("is-video-playback-mode-selected") ?? null,
        audioSelected: toggle?.getAttribute("is-audio-playback-mode-selected") ?? null,
        toggleDisabled: toggle?.hasAttribute("toggle-disabled") ?? null,
        videoButtonPressed: button.getAttribute("aria-pressed"),
        videoWidth: video?.videoWidth ?? null,
        currentSrcPrefix: (video?.currentSrc ?? "").slice(0, 24),
        readyState: video?.readyState ?? null
      });
    };
    snapshot("before press");
    window.setTimeout(() => snapshot("1.5 s after press"), 1500);
    window.setTimeout(() => snapshot("4 s after press"), 4e3);
    pressElement(button);
    return true;
  }
  function pressSelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    pressElement(el);
    return true;
  }

  // src/bridge/audio-graph.ts
  var FFT_SIZE = 2048;
  var BANDS = 64;
  var BAND_MIN_HZ = 40;
  var BAND_MAX_HZ = 16e3;
  var WINDOW_DB = 30;
  var PEAK_FALL_DB_PER_FRAME = 0.05;
  var FLOOR_DB = -85;
  var TILT_DB_PER_OCTAVE = 1.5;
  var TILT_REF_HZ = 1e3;
  var DB_SILENCE = -120;
  var ctx = null;
  var analyser = null;
  var attachedEl = null;
  var connected = /* @__PURE__ */ new WeakSet();
  function wireGestureResume() {
    const resume = () => {
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => void 0);
    };
    document.addEventListener("pointerdown", resume, true);
    document.addEventListener("keydown", resume, true);
  }
  function attachTap(video) {
    if (!ctx) {
      try {
        ctx = new AudioContext();
      } catch {
        return false;
      }
    }
    if (ctx.state !== "running") return false;
    if (attachedEl === video) return true;
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.6;
      analyser.connect(ctx.destination);
    }
    if (connected.has(video)) {
      attachedEl = video;
      return true;
    }
    try {
      const source = ctx.createMediaElementSource(video);
      source.connect(analyser);
      connected.add(video);
      attachedEl = video;
      return true;
    } catch {
      return false;
    }
  }
  var bandPeaks = [];
  function readBins() {
    if (!analyser || !ctx) return null;
    const n = analyser.frequencyBinCount;
    const db = new Float32Array(n);
    analyser.getFloatFrequencyData(db);
    for (let i = 0; i < n; i++) db[i] = Math.max(DB_SILENCE, db[i]);
    const silent = db.every((v) => v <= DB_SILENCE + 1);
    const binHz = ctx.sampleRate / analyser.fftSize;
    const bands = [];
    for (let k = 0; k < BANDS; k++) {
      const f = BAND_MIN_HZ * Math.pow(BAND_MAX_HZ / BAND_MIN_HZ, (k + 0.5) / BANDS);
      const pos = f / binHz;
      const i = Math.min(n - 2, Math.max(0, Math.floor(pos)));
      const t = Math.min(1, Math.max(0, pos - i));
      let level = db[i] + (db[i + 1] - db[i]) * t;
      level += TILT_DB_PER_OCTAVE * Math.log2(f / TILT_REF_HZ);
      if (bandPeaks.length !== BANDS) bandPeaks = new Array(BANDS).fill(FLOOR_DB);
      bandPeaks[k] = Math.max(level, bandPeaks[k] - PEAK_FALL_DB_PER_FRAME);
      const top = Math.max(bandPeaks[k], FLOOR_DB + WINDOW_DB);
      const norm = level < FLOOR_DB ? 0 : (level - (top - WINDOW_DB)) / WINDOW_DB;
      bands.push(Math.round(Math.min(1, Math.max(0, norm)) * 255));
    }
    return { bins: bands, silent };
  }

  // src/bridge/bridge.ts
  if (!window.__llamatubemusicBridge) {
    let startSpectrum = function() {
      if (spectrumTimer !== null) return;
      spectrumTimer = window.setInterval(spectrumTick, SPECTRUM_INTERVAL_MS);
    }, stopSpectrum = function() {
      if (spectrumTimer === null) return;
      window.clearInterval(spectrumTimer);
      spectrumTimer = null;
      post({ ns: NS, kind: "spectrum", payload: { bins: ZEROS, silent: false } });
    }, spectrumTick = function() {
      const video = findVideo();
      if (!video || !isPlaying()) return;
      if (!attachTap(video)) return;
      const frame = readBins();
      if (frame) post({ ns: NS, kind: "spectrum", payload: frame });
    }, postQueue = function() {
      post({ ns: NS, kind: "queue", payload: readQueue() });
    }, setQueueWatch = function(on) {
      if (on && queueTimer === null) {
        postQueue();
        queueTimer = window.setInterval(postQueue, QUEUE_INTERVAL_MS);
      } else if (!on && queueTimer !== null) {
        window.clearInterval(queueTimer);
        queueTimer = null;
      }
    }, emit = function(force = false) {
      const state = readState();
      const changed = !last || JSON.stringify({ ...state, currentTime: 0 }) !== JSON.stringify({ ...last, currentTime: 0 }) || Math.abs(state.currentTime - last.currentTime) >= TIME_EPSILON;
      if (state.playing) startSpectrum();
      else stopSpectrum();
      if (!force && !changed) return;
      last = state;
      post({ ns: NS, kind: "state", payload: state });
    };
    startSpectrum2 = startSpectrum, stopSpectrum2 = stopSpectrum, spectrumTick2 = spectrumTick, postQueue2 = postQueue, setQueueWatch2 = setQueueWatch, emit2 = emit;
    window.__llamatubemusicBridge = true;
    const MEDIA_EVENTS = [
      "play",
      "playing",
      "pause",
      "ended",
      "emptied",
      "loadedmetadata",
      "durationchange",
      "seeked",
      "volumechange",
      "timeupdate"
    ];
    const TIME_EPSILON = 0.25;
    const SPECTRUM_INTERVAL_MS = 33;
    const ZEROS = new Array(32).fill(0);
    let last = null;
    let spectrumTimer = null;
    const QUEUE_INTERVAL_MS = 1500;
    let queueTimer = null;
    for (const type of MEDIA_EVENTS) {
      document.addEventListener(type, () => emit(), true);
    }
    wireGestureResume();
    window.addEventListener("message", (e) => {
      if (e.source !== window) return;
      const msg = parseMessage(e.data);
      if (!msg) return;
      if (msg.kind === "hello") {
        emit(true);
      } else if (msg.kind === "cmd") {
        if (msg.payload.op === "queueWatch") setQueueWatch(msg.payload.on);
        else runCommand(msg.payload);
      }
    });
    setInterval(() => emit(), 1e3);
    emit(true);
  }
  var startSpectrum2;
  var stopSpectrum2;
  var spectrumTick2;
  var postQueue2;
  var setQueueWatch2;
  var emit2;
})();
