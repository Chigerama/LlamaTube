/**
 * Web Audio tap for the spectrum visualiser. Runs in the MAIN world, because
 * an AnalyserNode cannot be shared with the isolated content script.
 *
 * Rules this module follows:
 * - createMediaElementSource can run only once per element, so connected
 *   elements are remembered in a WeakSet. Element swaps get a new source.
 * - Every element routes source -> analyser -> destination. Skipping the
 *   destination makes the audio silent.
 * - Attach only while the AudioContext is running. Once an element is routed
 *   through a suspended context its audio is silent, and autoplay policy
 *   forbids resuming it without a user gesture. Until a gesture resumes the
 *   context, the visualiser shows zeros and the audio plays normally.
 */

const FFT_SIZE = 2048; // about 10.8 Hz per bin at 44.1 kHz: enough resolution for the bass
const BANDS = 64; // spectrum frames carry 64 bands, spaced evenly on a log (per-octave) scale
const BAND_MIN_HZ = 40;
const BAND_MAX_HZ = 16000;
// Level window, in dB, that maps to 0..100%. Anything quieter is the floor, anything louder the ceiling.
const FLOOR_DB = -80;
const CEIL_DB = -20;
// Music carries far more bass energy than treble, so lift the treble by this much per octave
// above TILT_REF_HZ (and lower the bass by the same amount below it).
const TILT_DB_PER_OCTAVE = 3;
const TILT_REF_HZ = 1000;
const DB_SILENCE = -120;

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let attachedEl: HTMLMediaElement | null = null;
const connected = new WeakSet<HTMLMediaElement>();

/** Resumes the context on the first pointer or key press. Browsers allow this only from a gesture. */
export function wireGestureResume(): void {
  const resume = (): void => {
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  };
  document.addEventListener('pointerdown', resume, true);
  document.addEventListener('keydown', resume, true);
}

/** Routes the element through the analyser. Returns true when the spectrum can read it. */
export function attachTap(video: HTMLMediaElement): boolean {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return false;
    }
  }
  if (ctx.state !== 'running') return false;
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
    // Already owned by another context, or the element is unsupported.
    return false;
  }
}

/** Current frequency bins (0..255 each), plus whether the signal is all zero. */
/**
 * One frame of spectrum bands, 0..255 each, spaced evenly on a log (per-octave) scale.
 *
 * Works in dB, not the byte scale, so bass does not clip at the top. Each band reads the
 * level at its centre frequency, gets a pink-noise tilt (music's energy falls with
 * frequency, so the treble is lifted to match), and is mapped from FLOOR_DB..CEIL_DB.
 */
export function readBins(): { bins: number[]; silent: boolean } | null {
  if (!analyser || !ctx) return null;
  const n = analyser.frequencyBinCount;
  const db = new Float32Array(n);
  analyser.getFloatFrequencyData(db);
  for (let i = 0; i < n; i++) db[i] = Math.max(DB_SILENCE, db[i]);
  const silent = db.every((v) => v <= DB_SILENCE + 1);
  const binHz = ctx.sampleRate / analyser.fftSize;

  const bands: number[] = [];
  for (let k = 0; k < BANDS; k++) {
    const f = BAND_MIN_HZ * Math.pow(BAND_MAX_HZ / BAND_MIN_HZ, (k + 0.5) / BANDS);
    const pos = f / binHz;
    const i = Math.min(n - 2, Math.max(0, Math.floor(pos)));
    const t = Math.min(1, Math.max(0, pos - i));
    let level = db[i] + (db[i + 1] - db[i]) * t;
    level += TILT_DB_PER_OCTAVE * Math.log2(f / TILT_REF_HZ);
    const norm = (level - FLOOR_DB) / (CEIL_DB - FLOOR_DB);
    bands.push(Math.round(Math.min(1, Math.max(0, norm)) * 255));
  }
  return { bins: bands, silent };
}
