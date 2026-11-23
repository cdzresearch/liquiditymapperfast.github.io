import type { Hub } from '../hub.ts';
import type { Store } from '../store.ts';
import type { View } from '../view.ts';
import { helpButton } from '../help.ts';
import { setTip } from '../tip.ts';
import { t } from '../i18n.ts';
import { HoverCard } from '../hovercard.ts';
import type { InfoLine } from '../infobox.ts';
import { AXIS_W } from './heat-pane.ts';
import { TimePane, setHtml } from './lower-panes.ts';
import { readAt } from './pane-cards.ts';
import { pageNow, replaying } from '../replay/clock.ts';
import { SPEED_NOW_MS, series, snapshot, speedColumns, type TapeSpeedSeries } from '../tape/speed.ts';
import { speedColumnAt, speedFullHtml, tapeSpeedCardLines } from '../tape/speed-text.ts';
import type { TapeSpeedSettings } from '../tape/settings.ts';

/**
 * Tape speed under the map: prints (market orders) per second over the chart's time, so stretches of fast and slow tape are visible.
 * Size is irrelevant. The counts come from the live tape this page has received (`Hub.speed`), a bounded ring of seconds.
 */
export class TapeSpeedPane extends TimePane {
  #card = new HoverCard();
  #lines: InfoLine[] | null = null;
  #series: TapeSpeedSeries | null = null;
  #sync: (() => void)[] = [];
  #timer = 0;

  constructor(host: HTMLElement, store: Store, view: View, private hub: Hub) {
    super(host, store, view, 'tapeSpeed');
    this.head.innerHTML = `<strong>${t('Tape speed')}</strong><span class="readout"></span>`;
    this.head.querySelector('strong')!.after(helpButton('tapeSpeedPane'));
    setTip(this.head.querySelector('strong')!, t('How many market orders print per second, regardless of size: the tape\'s pace, not dollars traded.'));
    const s = (): TapeSpeedSettings => this.store.state.tapeSpeed;
    const patch = (change: Partial<TapeSpeedSettings>): void => this.store.set({ tapeSpeed: { ...s(), ...change } });
    const wrap = document.createElement('label'); wrap.className = 'ctl';
    setTip(wrap, t('How long the live rate looks back, in seconds of exchange time.'));
    wrap.append(t('Now'));
    const control = document.createElement('select');
    for (const ms of SPEED_NOW_MS) control.append(new Option(t('{n} s', { n: ms / 1000 }), String(ms)));
    control.value = String(s().nowMs);
    control.onchange = () => patch({ nowMs: Number(control.value) as TapeSpeedSettings['nowMs'] });
    wrap.append(control); this.head.append(wrap);
    this.#sync.push(() => { if (control.value !== String(s().nowMs)) control.value = String(s().nowMs); });
    this.#timer = window.setInterval(() => { if (!this.root.hidden && !document.hidden) this.invalidate(); }, 1000);
  }

  settingsChanged(): void { for (const sync of this.#sync) sync(); this.invalidate(); }

  protected draw(): void {
    this.#lines = null;
    this.#paint();
    const at = this.pointer;
    if (this.#lines && at) this.#card.show(this.#lines, at.x, at.y); else this.#card.hide();
  }
  protected override undrawn(): void { this.#lines = null; this.#card.hide(); }

  #paint(): void {
    const { ctx, palette: p, view: v } = this, pw = this.plotW, ph = this.h, state = this.store.state;
    const now = pageNow(), cutoff = replaying() ? now : Number.POSITIVE_INFINITY;
    const t1 = Math.min(v.t1, cutoff);
    const columns = speedColumns(pw);
    const s = this.hub.speed;
    this.#series = series(s, v.t0, t1, columns);
    const ser = this.#series, readout = this.head.querySelector('.readout')!;
    const viewNow = snapshot(s, now, state.tapeSpeed.nowMs);
    setHtml(readout, speedFullHtml(viewNow));
    if (viewNow.from === null) {
      ctx.fillStyle = p.muted; ctx.textAlign = 'left';
      ctx.fillText(t('No tape yet. Live trades start when this page opens.'), 12, ph / 2);
      return;
    }
    let max = 0;
    for (let i = 0; i < ser.rate.length; i++) { const r = ser.rate[i]!; if (r === r && r > max) max = r; }
    const hi = Math.max(max, 0.001) * 1.08, y = (rate: number) => ph - 6 - rate / hi * (ph - 12);
    const xOf = (t: number) => v.xOf(t, pw);
    ctx.fillStyle = p.text;
    for (let i = 0; i < ser.rate.length; i++) {
      const rate = ser.rate[i]!; if (!(rate === rate)) continue;
      const x0 = xOf(ser.t0 + i * ser.step), x1 = xOf(ser.t0 + (i + 1) * ser.step);
      const top = y(rate), h = Math.max(1, ph - 6 - top);
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x0, top, Math.max(1, x1 - x0 - 0.4), h);
    }
    ctx.globalAlpha = 1;
    // The live rate as a dashed line across the pane, so a burst stands above it and a lull below.
    if (viewNow.avg5m === viewNow.avg5m) {
      const ly = y(viewNow.avg5m);
      ctx.strokeStyle = p.muted; ctx.setLineDash([4, 4]); ctx.beginPath();
      ctx.moveTo(0, ly + 0.5); ctx.lineTo(pw, ly + 0.5); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = p.muted; ctx.textAlign = 'left';
    ctx.fillText(t('{rate}/s', { rate: max >= 10 ? String(Math.round(hi)) : hi.toFixed(1) }), this.w - AXIS_W + 6, 10);
    ctx.fillText('0', this.w - AXIS_W + 6, ph - 8);
    const hv = state.hover;
    const under = hv ? speedColumnAt(ser, hv.t) : -1;
    const last = ser.rate.length - 1;
    const lastT = last >= 0 ? ser.t0 + last * ser.step : undefined;
    const over = hv && this.pointer ? readAt(under, hv.t, last, lastT) : -1;
    if (over >= 0 && hv && lastT !== undefined && hv.t >= lastT + ser.step) this.cursorT = lastT + ser.step / 2;
    if (over >= 0 && ser.rate[over] === ser.rate[over]) {
      this.#lines = tapeSpeedCardLines(ser.t0 + over * ser.step, ser.rate[over]!, ser.count[over]!, ser.step, viewNow);
    }
  }
}
