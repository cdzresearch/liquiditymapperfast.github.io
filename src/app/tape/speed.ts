import type { TapeRing } from './ring.ts';

/**
 * How fast the tape is moving: market orders (prints) per second, never USD. Fed from the live tape ring as batches arrive, kept in a
 * fixed ring of seconds so a tab open for days cannot grow. Size is irrelevant: one print is one print.
 *
 * The ring holds about eighteen hours of seconds (`SPEED_RING`). The session average uses the running total since the first print, two
 * numbers, so it does not need those hours. A view older than the ring has no speed (NaN), not a quiet market.
 */
export const SPEED_SEC = 1_000;
/** Seconds held: 2^16, a little over 18 hours. */
export const SPEED_RING = 1 << 16;
/** Live "now" windows the pane offers (ms of exchange time). */
export const SPEED_NOW_MS = [2_000, 5_000, 10_000] as const;
export type SpeedNowMs = (typeof SPEED_NOW_MS)[number];
export const SPEED_NOW_DEFAULT: SpeedNowMs = 5_000;
export const SPEED_AVG_1M = 60_000;
export const SPEED_AVG_5M = 300_000;

/** The live rate and the averages a readout compares it to, all in prints per second. */
export interface TapeSpeedView {
  /** Prints / s over the live window ending at `now`. */
  current: number;
  avg1m: number;
  avg5m: number;
  /** Prints / s since the first print this page counted, including quiet seconds after the last one. */
  session: number;
  /** Exchange time of the first print, or null before any. */
  from: number | null;
  /** Exchange time of the last print, or null. */
  last: number | null;
  /** How many prints have been counted (the session's numerator). */
  total: number;
  /** `current / avg5m` (1 when both are 0; Infinity when the average is 0 and something is printing). */
  vs5m: number;
}

/** One column of the pane: prints in that slice of time, as a rate (NaN where this page never counted). */
export interface TapeSpeedSeries {
  t0: number;
  step: number;
  rate: Float32Array;
  count: Float32Array;
}

const ofSec = (ms: number): number => Math.floor(ms / SPEED_SEC);

/**
 * Bounded per-second print counts, plus the session's running total. No DOM; the pane and the readouts read this.
 */
export class TapeSpeed {
  readonly counts = new Uint16Array(SPEED_RING);
  /** Unix second stored at `counts[0]`; 0 before the first print. */
  base = 0;
  /** First and last unix seconds that have a slot in the ring (inclusive), 0 before any print. */
  first = 0;
  last = 0;
  /** Prints counted since the first (the session), including those the ring has since let go. */
  total = 0;
  /** Exchange time of the first print ever, kept after the ring slides. */
  started: number | null = null;
  /** `TapeRing.written` ingested up to (so a batch is counted once). */
  #seen = 0;

  /** One print at exchange time `t` (ms). */
  add(t: number): void {
    if (!Number.isFinite(t)) return;
    const sec = ofSec(t);
    if (!this.started) this.started = t;
    this.total++;
    if (!this.base) {
      this.base = sec;
      this.first = sec;
      this.last = sec;
      this.counts[0] = 1;
      return;
    }
    if (sec < this.base) return;
    if (sec >= this.base + SPEED_RING) this.#slide(sec - SPEED_RING + 1);
    const i = sec - this.base;
    if (this.counts[i]! < 0xffff) this.counts[i]!++;
    if (sec > this.last) this.last = sec;
  }

  /** Every new write of `ring` since the last look. A wrap skips writes the ring has already dropped (they were counted as they arrived). */
  ingest(ring: TapeRing): void {
    const from = Math.max(this.#seen, ring.first);
    for (let k = from; k < ring.written; k++) this.add(ring.at(k).t);
    this.#seen = ring.written;
  }

  /** Prints whose second is in [fromSec, toSec] and still in the ring. */
  countSeconds(fromSec: number, toSec: number): number {
    if (!this.base || toSec < fromSec) return 0;
    const a = Math.max(fromSec, this.base, this.first);
    const b = Math.min(toSec, this.base + SPEED_RING - 1, this.last);
    if (b < a) return 0;
    let n = 0;
    for (let s = a; s <= b; s++) n += this.counts[s - this.base]!;
    return n;
  }

  /** Let go of everything (another coin reloads the page; this is for tests). */
  clear(): void {
    this.counts.fill(0);
    this.base = 0; this.first = 0; this.last = 0; this.total = 0; this.started = null; this.#seen = 0;
  }

  /** Drop seconds before `next` so a print at the live edge still fits. */
  #slide(next: number): void {
    const shift = next - this.base;
    if (shift <= 0) return;
    if (shift >= SPEED_RING) {
      this.counts.fill(0);
      this.base = next;
      this.first = 0;
      this.last = 0;
      return;
    }
    this.counts.copyWithin(0, shift);
    this.counts.fill(0, SPEED_RING - shift);
    this.base = next;
    if (this.first && this.first < next) this.first = this.last >= next ? next : 0;
  }
}

/**
 * Prints per second over [fromMs, toMs), clipped to when counting began, including quiet seconds after the last print (the tape stopped).
 * A window that has not begun yet, or that ends before counting did, is 0.
 */
export function windowRate(speed: TapeSpeed, fromMs: number, toMs: number): number {
  if (!(toMs > fromMs) || speed.started === null) return 0;
  const startSec = Math.max(ofSec(fromMs), ofSec(speed.started));
  const endSec = ofSec(toMs - 1);
  if (endSec < startSec) return 0;
  const count = speed.countSeconds(startSec, endSec);
  return count / (endSec - startSec + 1);
}

export function snapshot(speed: TapeSpeed, now: number, nowMs: number = SPEED_NOW_DEFAULT): TapeSpeedView {
  const current = windowRate(speed, now - nowMs, now);
  const avg1m = windowRate(speed, now - SPEED_AVG_1M, now);
  const avg5m = windowRate(speed, now - SPEED_AVG_5M, now);
  const elapsed = speed.started !== null ? Math.max(SPEED_SEC, now - speed.started) : 0;
  const session = elapsed > 0 ? speed.total / (elapsed / SPEED_SEC) : 0;
  const vs5m = avg5m > 0 ? current / avg5m : current > 0 ? Infinity : 1;
  return {
    current, avg1m, avg5m, session, vs5m, total: speed.total,
    from: speed.started, last: speed.last ? speed.last * SPEED_SEC : null,
  };
}

/**
 * `columns` equal slices of [t0, t1): each the prints in that slice over its length in seconds. A slice this page never counted (before
 * the first print, or older than the ring still holds) is NaN, so the pane leaves a hole instead of drawing a quiet market.
 */
export function series(speed: TapeSpeed, t0: number, t1: number, columns: number): TapeSpeedSeries {
  const n = Math.max(1, columns | 0);
  const step = t1 > t0 ? (t1 - t0) / n : 0;
  const rate = new Float32Array(n), count = new Float32Array(n);
  rate.fill(NaN); count.fill(NaN);
  if (!(step > 0) || speed.started === null || !speed.base) return { t0, step, rate, count };
  const heldFrom = speed.base * SPEED_SEC;
  const started = speed.started;
  for (let i = 0; i < n; i++) {
    const a = t0 + i * step, b = a + step;
    const from = Math.max(a, started, heldFrom);
    if (!(b > from)) continue;
    const nPrints = speed.countSeconds(ofSec(from), ofSec(b - 1));
    count[i] = nPrints;
    rate[i] = nPrints / ((b - from) / SPEED_SEC);
  }
  return { t0, step, rate, count };
}

/** How many columns the pane asks for over a plot `plotW` px wide (the Depth pane's rule: a column is about two pixels). */
export const speedColumns = (plotW: number): number => Math.min(1200, Math.max(60, Math.floor(plotW / 2)));

/** The rate as a short figure: one decimal under 10 / s, none above. */
export function rateText(perSec: number): string {
  if (!Number.isFinite(perSec) || perSec < 0) return '–';
  if (perSec === 0) return '0';
  if (perSec < 10) return perSec.toFixed(1);
  return String(Math.round(perSec));
}
