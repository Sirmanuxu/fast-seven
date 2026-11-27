import { Result, Tournament } from './model';

export type StartTournamentError = 'fixtureNotReady';

export function startTournament(
  tournament: Tournament,
  startedAt: string,
): Result<Tournament, StartTournamentError> {
  if (tournament.status !== 'FIXTURE_GENERATED') {
    return { ok: false, error: 'fixtureNotReady' };
  }

  return {
    ok: true,
    value: {
      ...tournament,
      status: 'RUNNING',
      updatedAt: startedAt,
    },
  };
}
