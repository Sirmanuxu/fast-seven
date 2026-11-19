import { describe, expect, it } from 'vitest';
import { advanceFixedClock, createFixedClock } from './clock';

describe('fixed clock', () => {
  it('returns the injected time', () => {
    const clock = createFixedClock(12345);

    expect(clock.nowMs()).toBe(12345);
  });

  it('creates an advanced immutable clock value', () => {
    const clock = createFixedClock(12345);
    const advanced = advanceFixedClock(clock, 500);

    expect(clock.nowMs()).toBe(12345);
    expect(advanced.nowMs()).toBe(12845);
  });
});
