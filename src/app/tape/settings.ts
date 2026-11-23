import { SPEED_NOW_DEFAULT, SPEED_NOW_MS, type SpeedNowMs } from './speed.ts';

/** The Tape speed pane's own settings (whether it shows is `show.tapeSpeed`). */
export interface TapeSpeedSettings {
  /** How long the live rate looks back, in ms of exchange time. */
  nowMs: SpeedNowMs;
}

export const TAPE_SPEED_DEFAULTS: Readonly<TapeSpeedSettings> = Object.freeze({ nowMs: SPEED_NOW_DEFAULT });

export function readTapeSpeed(saved: unknown): TapeSpeedSettings {
  const s = (saved && typeof saved === 'object' ? saved : {}) as Partial<Record<keyof TapeSpeedSettings, unknown>>;
  return {
    nowMs: typeof s.nowMs === 'number' && (SPEED_NOW_MS as readonly number[]).includes(s.nowMs) ? s.nowMs as SpeedNowMs : TAPE_SPEED_DEFAULTS.nowMs,
  };
}
