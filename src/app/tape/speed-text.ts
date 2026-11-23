import type { InfoLine } from '../infobox.ts';
import { t } from '../i18n.ts';
import { clock } from '../format.ts';
import { rateText, type TapeSpeedSeries, type TapeSpeedView } from './speed.ts';

/** A live rate this far above the 5-minute average is drawn as fast; this far below, as slow. */
export const FAST_VS_5M = 1.5, SLOW_VS_5M = 0.5;

/** `hot` when the tape is running fast against its 5-minute average, `cool` when it is slow, else nothing. */
export function speedTone(vs5m: number): 'hot' | 'cool' | null {
  if (!Number.isFinite(vs5m)) return vs5m === Infinity ? 'hot' : null;
  if (vs5m >= FAST_VS_5M) return 'hot';
  if (vs5m > 0 && vs5m <= SLOW_VS_5M) return 'cool';
  return null;
}

const nowLabel = (view: TapeSpeedView): string => t('now {rate}/s', { rate: rateText(view.current) });

/** The compact line beside the flow column: live rate and the 5-minute average. */
export function speedCompactText(view: TapeSpeedView): string {
  if (view.from === null) return t('no tape yet');
  return `${nowLabel(view)} · ${t('5m {rate}', { rate: rateText(view.avg5m) })}`;
}

/** The full line on the Tape tab and the pane: live rate against 1m, 5m and the session. */
export function speedFullText(view: TapeSpeedView): string {
  if (view.from === null) return t('no tape yet');
  return [
    nowLabel(view),
    t('1m {rate}', { rate: rateText(view.avg1m) }),
    t('5m {rate}', { rate: rateText(view.avg5m) }),
    t('session {rate}', { rate: rateText(view.session) }),
  ].join(' · ');
}

const toneClass = (view: TapeSpeedView): string => {
  const tone = speedTone(view.vs5m);
  return tone ? ` class="${tone}"` : '';
};

/** The same words as HTML, the live rate in `<b>` so a fast/slow class can colour it. */
export function speedCompactHtml(view: TapeSpeedView): string {
  if (view.from === null) return t('no tape yet');
  return `<b${toneClass(view)}>${nowLabel(view)}</b> · ${t('5m {rate}', { rate: rateText(view.avg5m) })}`;
}

export function speedFullHtml(view: TapeSpeedView): string {
  if (view.from === null) return t('no tape yet');
  return [
    `<b${toneClass(view)}>${nowLabel(view)}</b>`,
    t('1m {rate}', { rate: rateText(view.avg1m) }),
    t('5m {rate}', { rate: rateText(view.avg5m) }),
    t('session {rate}', { rate: rateText(view.session) }),
  ].join(' · ');
}

/** The popup for one column of the pane: its time, its prints / s, and how that sits against the live averages. */
export function tapeSpeedCardLines(at: number, rate: number, prints: number, stepMs: number, view: TapeSpeedView): InfoLine[] {
  const lines: InfoLine[] = [
    { text: `${clock(at, true)} · ${t('{n} s', { n: Math.max(1, Math.round(stepMs / 1000)) })}`, bold: true },
    { label: t('Tape speed'), text: t('{rate}/s', { rate: rateText(rate) }), bold: true },
    { label: t('Prints'), text: Number.isFinite(prints) ? String(Math.round(prints)) : '–' },
  ];
  if (view.from !== null) {
    lines.push({ label: t('Now'), text: t('{rate}/s', { rate: rateText(view.current) }), color: 'muted' });
    lines.push({ label: t('5 minutes'), text: t('{rate}/s', { rate: rateText(view.avg5m) }), color: 'muted' });
    lines.push({ label: t('Session'), text: t('{rate}/s', { rate: rateText(view.session) }), color: 'muted' });
  }
  return lines;
}

/** Which column of `s` holds `time`, or -1. */
export function speedColumnAt(s: TapeSpeedSeries, time: number): number {
  if (!(s.step > 0) || time < s.t0) return -1;
  const i = Math.floor((time - s.t0) / s.step);
  return i >= 0 && i < s.rate.length ? i : -1;
}
