import { Clock } from './model';

export function createFixedClock(nowMs: number): Clock {
  const currentMs = nowMs;
  return {
    nowMs(): number {
      return currentMs;
    },
  };
}

export function advanceFixedClock(clock: Clock, additionalMs: number): Clock {
  return createFixedClock(clock.nowMs() + additionalMs);
}
