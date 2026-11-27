import { Match, Result, Tournament } from './model';

export type StartTournamentMatchError = 'fixtureNotReady' | 'matchNotPending';

export interface StartTournamentMatchTransition {
  readonly tournament: Tournament;
  readonly match: Match;
  readonly requiresBackup: boolean;
}

export function startTournamentMatch(
  tournament: Tournament,
  match: Match,
  startedAt: string,
): Result<StartTournamentMatchTransition, StartTournamentMatchError> {
  if (tournament.status !== 'FIXTURE_GENERATED' && tournament.status !== 'RUNNING') {
    return { ok: false, error: 'fixtureNotReady' };
  }
  if (match.status !== 'PENDING') {
    return { ok: false, error: 'matchNotPending' };
  }

  return {
    ok: true,
    value: {
      tournament: {
        ...tournament,
        status: 'RUNNING',
        updatedAt: startedAt,
      },
      match: {
        ...match,
        status: 'IN_PROGRESS',
        startedAt,
      },
      requiresBackup: tournament.status === 'FIXTURE_GENERATED',
    },
  };
}
