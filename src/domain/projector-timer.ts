import { Clock, DomainError, ProjectorTimer, Result } from './model';
import { ProjectorContext } from './projector-context';

const MILLISECONDS_PER_MINUTE = 60_000;

function error(code: string, messageKey: string): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey } };
}

export function createProjectorTimer(
  name: string,
  durationMinutes: number,
  clock: Clock,
): Result<ProjectorTimer, DomainError> {
  const trimmedName = name.trim();
  if (!trimmedName) return error('timerNameRequired', 'projectorTimer.nameRequired');
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1) {
    return error('timerDurationInvalid', 'projectorTimer.durationInvalid');
  }

  const endsAtEpochMs = clock.nowMs() + durationMinutes * MILLISECONDS_PER_MINUTE;
  if (!Number.isSafeInteger(endsAtEpochMs)) {
    return error('timerDurationInvalid', 'projectorTimer.durationInvalid');
  }

  return { ok: true, value: { name: trimmedName, endsAtEpochMs } };
}

export function adjustProjectorTimer(
  timer: ProjectorTimer,
  minutes: -1 | 1,
  clock: Clock,
): ProjectorTimer {
  const nowEpochMs = clock.nowMs();
  const endsAtEpochMs =
    minutes === 1
      ? Math.max(timer.endsAtEpochMs, nowEpochMs) + MILLISECONDS_PER_MINUTE
      : Math.max(timer.endsAtEpochMs - MILLISECONDS_PER_MINUTE, nowEpochMs);

  return { ...timer, endsAtEpochMs };
}

export function isProjectorTimerExpired(timer: ProjectorTimer, nowEpochMs: number): boolean {
  return timer.endsAtEpochMs <= nowEpochMs;
}

export function isProjectorTimerVisible(
  timer: ProjectorTimer,
  nowEpochMs: number,
  isForcedView: boolean,
  context: ProjectorContext,
): boolean {
  return isForcedView || context === 'BREAK' || isProjectorTimerExpired(timer, nowEpochMs);
}

export function formatProjectorTimer(timer: ProjectorTimer, nowEpochMs: number): string {
  const seconds = Math.max(0, Math.ceil((timer.endsAtEpochMs - nowEpochMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
