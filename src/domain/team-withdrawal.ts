import {
  Clock,
  DomainError,
  Id,
  Match,
  ResolvedMatch,
  Result,
  Team,
  TournamentSnapshot,
} from './model';
import { finishWalkover } from './match-control';

export interface TeamWithdrawalChange {
  readonly team: Team;
  readonly matches: readonly Match[];
  readonly affectedMatchIds: readonly Id[];
}

export interface WithdrawalWalkovers {
  readonly matches: readonly Match[];
  readonly affectedMatchIds: readonly Id[];
}

function error(code: string, messageKey: string): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey } };
}

export function finishPendingWithdrawalWalkovers(
  snapshot: TournamentSnapshot,
  resolvedMatches: readonly ResolvedMatch[],
  clock: Clock,
): Result<WithdrawalWalkovers, DomainError> {
  if (
    snapshot.tournament.status !== 'RUNNING' &&
    snapshot.tournament.status !== 'FINISHED'
  ) {
    return error('tournamentNotRunning', 'teamWithdrawal.tournamentNotRunning');
  }

  const resolvedById = new Map(resolvedMatches.map((resolved) => [resolved.matchId, resolved]));
  const teamStatuses = new Map(snapshot.teams.map((team) => [team.id, team.status]));
  const changedMatches: Match[] = [];

  for (const match of snapshot.matches) {
    if (match.status !== 'PENDING' || match.isPhantom || match.isConditional) continue;

    const resolved = resolvedById.get(match.id);
    if (!resolved?.isPlayable || !resolved.homeTeamId || !resolved.awayTeamId) continue;

    const homeWithdrawn = teamStatuses.get(resolved.homeTeamId) === 'WITHDRAWN';
    const awayWithdrawn = teamStatuses.get(resolved.awayTeamId) === 'WITHDRAWN';
    if (homeWithdrawn === awayWithdrawn) continue;

    const absentTeamId = homeWithdrawn ? resolved.homeTeamId : resolved.awayTeamId;
    const finished = finishWalkover(snapshot, resolvedMatches, match.id, absentTeamId, clock, {
      kind: 'TEAM_WITHDRAWAL',
      teamId: absentTeamId,
    });
    if (!finished.ok) return finished;
    changedMatches.push(finished.value);
  }

  return {
    ok: true,
    value: {
      matches: changedMatches,
      affectedMatchIds: changedMatches.map((match) => match.id),
    },
  };
}

export function withdrawTeam(
  snapshot: TournamentSnapshot,
  resolvedMatches: readonly ResolvedMatch[],
  teamId: Id,
  clock: Clock,
): Result<TeamWithdrawalChange, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'teamWithdrawal.tournamentNotRunning');
  }

  const team = snapshot.teams.find((candidate) => candidate.id === teamId);
  if (!team) {
    return error('teamNotFound', 'teamWithdrawal.teamNotFound');
  }
  if (team.status === 'WITHDRAWN') {
    return error('teamAlreadyWithdrawn', 'teamWithdrawal.teamAlreadyWithdrawn');
  }

  const resolvedById = new Map(resolvedMatches.map((resolved) => [resolved.matchId, resolved]));
  const liveMatch = snapshot.matches.find((match) => {
    if (match.status !== 'IN_PROGRESS') return false;
    const resolved = resolvedById.get(match.id);
    return resolved?.homeTeamId === teamId || resolved?.awayTeamId === teamId;
  });
  if (liveMatch) {
    return error('teamHasInProgressMatch', 'teamWithdrawal.teamHasInProgressMatch');
  }

  const withdrawnSnapshot: TournamentSnapshot = {
    ...snapshot,
    teams: snapshot.teams.map((candidate) =>
      candidate.id === teamId ? { ...candidate, status: 'WITHDRAWN' } : candidate,
    ),
  };
  const walkovers = finishPendingWithdrawalWalkovers(withdrawnSnapshot, resolvedMatches, clock);
  if (!walkovers.ok) return walkovers;

  return {
    ok: true,
    value: {
      team: { ...team, status: 'WITHDRAWN' },
      matches: walkovers.value.matches,
      affectedMatchIds: walkovers.value.affectedMatchIds,
    },
  };
}

export function reinstateTeam(
  snapshot: TournamentSnapshot,
  teamId: Id,
): Result<TeamWithdrawalChange, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'teamWithdrawal.tournamentNotRunning');
  }

  const team = snapshot.teams.find((candidate) => candidate.id === teamId);
  if (!team) {
    return error('teamNotFound', 'teamWithdrawal.teamNotFound');
  }
  if (team.status !== 'WITHDRAWN') {
    return error('teamNotWithdrawn', 'teamWithdrawal.teamNotWithdrawn');
  }

  const matches = snapshot.matches
    .filter(
      (match) =>
        match.status === 'FINISHED' &&
        match.result?.mode === 'WALKOVER' &&
        match.result.walkoverOrigin?.kind === 'TEAM_WITHDRAWAL' &&
        match.result.walkoverOrigin.teamId === teamId,
    )
    .map(
      (match): Match => ({
        ...match,
        status: 'PENDING',
        result: null,
        startedAt: null,
        finishedAt: null,
      }),
    );

  return {
    ok: true,
    value: {
      team: { ...team, status: 'ACTIVE' },
      matches,
      affectedMatchIds: matches.map((match) => match.id),
    },
  };
}
