import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK, TapeRing } from '../src/app/tape/ring.ts';
import { packTape, type TapeBatch } from '../src/shared/tape.ts';
import type { MarketOrder } from '../src/shared/orders.ts';
import { SPEED_AVG_5M, SPEED_NOW_DEFAULT, SPEED_RING, SPEED_SEC, TapeSpeed, rateText, series, snapshot, windowRate } from '../src/app/tape/speed.ts';
import { FAST_VS_5M, SLOW_VS_5M, speedColumnAt, speedCompactText, speedFullText, speedTone, tapeSpeedCardLines } from '../src/app/tape/speed-text.ts';
import { TAPE_SPEED_DEFAULTS, readTapeSpeed } from '../src/app/tape/settings.ts';
import { LAYOUT_KEYS, readSettings } from '../src/app/store.ts';

const T0 = 1_800_000_000_000;

const order = (t: number, usd = 1_000, id = 'binance:BTCUSDT'): MarketOrder =>
  ({ instrumentId: id, tradeId: `${id}-${t}`, side: usd >= 0 ? 'buy' : 'sell', t, price: 80_000, lo: 80_000, hi: 80_000, usd: Math.abs(usd), fills: 1 });

const batch = (seq: number, times: readonly number[], usd = 1_000): TapeBatch =>
  packTape(times.map(t => order(t, usd)), seq);

test('one print is one print: size does not change the rate', () => {
  const a = new TapeSpeed(), b = new TapeSpeed();
  for (let i = 0; i < 10; i++) { a.add(T0 + i * 100); b.add(T0 + i * 100); }
  // Ten tiny prints and ten huge ones over the same second are the same speed.
  const now = T0 + SPEED_NOW_DEFAULT;
  assert.equal(snapshot(a, now).current, snapshot(b, now).current);
  assert.equal(snapshot(a, now).total, 10);
});

test('the live rate is prints in the now window over that many seconds, including quiet time after the last print', () => {
  const s = new TapeSpeed();
  // 10 prints in the first second of the window, then nothing.
  for (let i = 0; i < 10; i++) s.add(T0 + i);
  const live = snapshot(s, T0 + SPEED_NOW_DEFAULT);
  assert.equal(live.current, 10 / (SPEED_NOW_DEFAULT / SPEED_SEC));
  assert.equal(live.last, ofLast(s));
  assert.equal(live.from, T0);
});

test('a short session clips the 1m and 5m windows to when counting began, not to minutes of zeros', () => {
  const s = new TapeSpeed();
  s.add(T0);
  s.add(T0 + 500);
  const now = T0 + 10_000;
  const view = snapshot(s, now);
  // Two prints over 10 seconds, not over five minutes.
  assert.ok(Math.abs(view.avg5m - 2 / 10) < 1e-12, String(view.avg5m));
  assert.equal(view.avg1m, view.avg5m);
  assert.ok(Math.abs(view.session - 2 / 10) < 1e-12, String(view.session));
});

test('session keeps the running total after the ring lets old seconds go', () => {
  const s = new TapeSpeed();
  s.add(T0);
  // A print just past the ring's far edge slides the first second off.
  s.add(T0 + SPEED_RING * SPEED_SEC);
  assert.equal(s.total, 2);
  assert.equal(s.countSeconds(Math.floor(T0 / SPEED_SEC), Math.floor(T0 / SPEED_SEC)), 0, 'the first second has left the ring');
  const now = T0 + SPEED_RING * SPEED_SEC + 1_000;
  const view = snapshot(s, now);
  assert.equal(view.session, 2 / ((now - T0) / SPEED_SEC));
  assert.equal(view.from, T0);
});

test('a window before counting began is 0, not a quiet market', () => {
  const s = new TapeSpeed();
  s.add(T0);
  assert.equal(windowRate(s, T0 - 60_000, T0 - 30_000), 0);
  assert.equal(windowRate(s, T0 - 1_000, T0 + 1_000) > 0, true);
});

test('ingest reads each new write of the tape ring once, and a wrap does not count a print twice', () => {
  const ring = new TapeRing(BLOCK);
  const speed = new TapeSpeed();
  ring.add(batch(0, [T0, T0 + 1, T0 + 2]), 1, 0);
  speed.ingest(ring);
  assert.equal(speed.total, 3);
  speed.ingest(ring);
  assert.equal(speed.total, 3, 'the same writes are not counted again');
  ring.add(batch(1, [T0 + 3, T0 + 4]), 1, 0);
  speed.ingest(ring);
  assert.equal(speed.total, 5);
});

test('usd in the tape batch is ignored: ten $1 prints match ten $1m prints', () => {
  const small = new TapeRing(BLOCK), large = new TapeRing(BLOCK);
  const a = new TapeSpeed(), b = new TapeSpeed();
  small.add(batch(0, Array.from({ length: 8 }, (_, i) => T0 + i), 1), 1, 0);
  large.add(batch(0, Array.from({ length: 8 }, (_, i) => T0 + i), 1_000_000), 1, 0);
  a.ingest(small); b.ingest(large);
  const now = T0 + SPEED_NOW_DEFAULT;
  assert.equal(snapshot(a, now).current, snapshot(b, now).current);
});

test('series leaves columns before the first print as NaN, and counts prints per slice over that slice\'s seconds', () => {
  const s = new TapeSpeed();
  for (let i = 0; i < 5; i++) s.add(T0 + 1_000 + i); // five prints in second T0+1s
  const out = series(s, T0, T0 + 4_000, 4);
  assert.equal(out.step, 1_000);
  assert.ok(Number.isNaN(out.rate[0]!), 'the first second is before the first print (started at T0+1000, prints at T0+1000..1004)');
  // column 1 is [T0+1000, T0+2000): the five prints
  assert.equal(out.count[1], 5);
  assert.equal(out.rate[1], 5);
  assert.equal(out.count[2], 0);
  assert.equal(out.rate[2], 0);
});

test('a column older than the ring still holds is NaN, not zero', () => {
  const s = new TapeSpeed();
  s.add(T0);
  s.add(T0 + SPEED_RING * SPEED_SEC);
  const out = series(s, T0, T0 + 2_000, 2);
  assert.ok(Number.isNaN(out.rate[0]!), 'the first print has left the ring');
});

test('rateText is a short figure, and vs5m marks fast and slow', () => {
  assert.equal(rateText(0), '0');
  assert.equal(rateText(3.2), '3.2');
  assert.equal(rateText(42.4), '42');
  assert.equal(rateText(Number.NaN), '–');
  assert.equal(speedTone(FAST_VS_5M), 'hot');
  assert.equal(speedTone(SLOW_VS_5M), 'cool');
  assert.equal(speedTone(1), null);
  assert.equal(speedTone(Infinity), 'hot');
});

test('the readout names the live rate against 1m, 5m and the session, and the popup is the same numbers', () => {
  const s = new TapeSpeed();
  for (let i = 0; i < 20; i++) s.add(T0 + i * 50);
  const view = snapshot(s, T0 + SPEED_NOW_DEFAULT);
  assert.match(speedFullText(view), /now /);
  assert.match(speedFullText(view), /1m /);
  assert.match(speedFullText(view), /5m /);
  assert.match(speedFullText(view), /session /);
  assert.match(speedCompactText(view), /5m /);
  assert.equal(speedFullText(snapshot(new TapeSpeed(), T0)), 'no tape yet');
  const ser = series(s, T0, T0 + 10_000, 5);
  const at = speedColumnAt(ser, T0 + 1_500);
  assert.equal(at, 0);
  const lines = tapeSpeedCardLines(T0, ser.rate[0]!, ser.count[0]!, ser.step, view);
  assert.equal(lines[1]?.label, 'Tape speed');
});

test('readTapeSpeed keeps a valid now window and is a layout setting; the pane starts off', () => {
  assert.equal(readTapeSpeed(undefined).nowMs, TAPE_SPEED_DEFAULTS.nowMs);
  assert.equal(readTapeSpeed({ nowMs: 2_000 }).nowMs, 2_000);
  assert.equal(readTapeSpeed({ nowMs: 7_000 }).nowMs, TAPE_SPEED_DEFAULTS.nowMs);
  assert.equal(readSettings({}).show.tapeSpeed, false);
  assert.equal(readSettings({ tapeSpeed: { nowMs: 10_000 } }).tapeSpeed.nowMs, 10_000);
  assert.ok((LAYOUT_KEYS as readonly string[]).includes('tapeSpeed'));
});

function ofLast(s: TapeSpeed): number { return s.last * SPEED_SEC; }
