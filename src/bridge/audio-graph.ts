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

const FFT_SIZE = 512; // 256 frequency bins: enough resolution at the bass end
const BANDS = 64; // spectrum frames carry 64 bands, spaced evenly on a log (per-octave) scale

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
    analyser.smoothingTimeConstant = 0.7;
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
export function readBins(): { bins: number[]; silent: boolean } | null {
  if (!analyser) return null;
  const buf = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(buf);
  let sum = 0;
  for (const v of buf) sum += v;
  // Group the linear FFT bins into log-spaced bands. Bin 0 is DC, so it is skipped.
  const count = buf.length;
  const bands: number[] = [];
  for (let k = 0; k < BANDS; k++) {
    const lo = Math.max(1, Math.floor(Math.pow(count, k / BANDS)));
    const hi = Math.max(lo + 1, Math.floor(Math.pow(count, (k + 1) / BANDS)));
    let peak = 0;
    for (let j = lo; j < Math.min(hi, count); j++) peak = Math.max(peak, buf[j]);
    bands.push(peak);
  }
  return { bins: bands, silent: sum === 0 };
}
