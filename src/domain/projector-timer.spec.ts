import { describe, expect, it } from 'vitest';
import { createFixedClock } from './clock';
import {
  adjustProjectorTimer,
  createProjectorTimer,
  formatProjectorTimer,
  isProjectorTimerExpired,
  isProjectorTimerVisible,
} from './projector-timer';

describe('projector timer', () => {
  it('creates a named timer from a duration and injected clock', () => {
    expect(createProjectorTimer('  Break  ', 10, createFixedClock(1_000))).toEqual({
      ok: true,
      value: { name: 'Break', endsAtEpochMs: 601_000 },
    });
  });

  it('rejects empty names and invalid durations', () => {
    const clock = createFixedClock(0);
    expect(createProjectorTimer(' ', 10, clock)).toMatchObject({
      ok: false,
      error: { code: 'timerNameRequired' },
    });
    expect(createProjectorTimer('Break', 0, clock)).toMatchObject({
      ok: false,
      error: { code: 'timerDurationInvalid' },
    });
    expect(createProjectorTimer('Break', 1.5, clock)).toMatchObject({
      ok: false,
      error: { code: 'timerDurationInvalid' },
    });
  });

  it('adds or subtracts one minute without moving a finished timer below zero', () => {
    const timer = { name: 'Break', endsAtEpochMs: 90_000 };
    const clock = createFixedClock(0);
    expect(adjustProjectorTimer(timer, 1, clock).endsAtEpochMs).toBe(150_000);
    expect(adjustProjectorTimer(timer, -1, clock).endsAtEpochMs).toBe(30_000);
    expect(adjustProjectorTimer(timer, -1, createFixedClock(120_000)).endsAtEpochMs).toBe(
      120_000,
    );
    expect(adjustProjectorTimer(timer, 1, createFixedClock(120_000)).endsAtEpochMs).toBe(
      180_000,
    );
  });

  it('formats the remaining time by rounding up and stays at zero after expiry', () => {
    const timer = { name: 'Break', endsAtEpochMs: 60_001 };
    expect(formatProjectorTimer(timer, 1_000)).toBe('01:00');
    expect(formatProjectorTimer(timer, 60_001)).toBe('00:00');
    expect(isProjectorTimerExpired(timer, 60_001)).toBe(true);
    expect(isProjectorTimerExpired(timer, 60_000)).toBe(false);
  });

  it('shows the overlay during breaks, on forced views, and after expiry', () => {
    const timer = { name: 'Break', endsAtEpochMs: 60_000 };
    expect(isProjectorTimerVisible(timer, 0, false, 'BREAK')).toBe(true);
    expect(isProjectorTimerVisible(timer, 0, false, 'BETWEEN_MATCHES')).toBe(false);
    expect(isProjectorTimerVisible(timer, 0, true, 'MATCH_IN_PROGRESS')).toBe(true);
    expect(isProjectorTimerVisible(timer, 60_000, false, 'MATCH_IN_PROGRESS')).toBe(true);
  });
});
