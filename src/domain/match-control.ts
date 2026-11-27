import {
  Clock,
  DomainError,
  Id,
  Match,
  MatchEvent,
  ResolvedMatch,
  Result,
  TournamentSnapshot,
} from './model';
import { formatIsoDateTime } from './schedule';
import { computeScore, validateMatchEventPlayer } from './match-events';

export interface MatchControlView {
  readonly current: { readonly match: Match; readonly resolved: ResolvedMatch } | null;
  readonly next: { readonly match: Match; readonly resolved: ResolvedMatch } | null;
  readonly following: readonly {
    readonly match: Match;
    readonly resolved: ResolvedMatch;
  }[];
}

function error(
  code: string,
  messageKey: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return {
    ok: false,
    error: { code, messageKey, ...(params ? { params } : {}) },
  };
}

export function startMatch(
  snapshot: TournamentSnapshot,
  resolvedMatches: readonly ResolvedMatch[],
  matchId: Id,
  clock: Clock,
): Result<Match, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'matchControl.tournamentNotRunning');
  }

  const match = snapshot.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    return error('matchNotFound', 'matchControl.matchNotFound', { matchId });
  }
  if (match.status !== 'PENDING') {
    return error('matchNotPending', 'matchControl.matchNotPending');
  }
  if (snapshot.matches.some((candidate) => candidate.status === 'IN_PROGRESS')) {
    return error('matchAlreadyInProgress', 'matchControl.matchAlreadyInProgress');
  }

  const resolved = resolvedMatches.find((candidate) => candidate.matchId === matchId);
  if (!resolved?.isPlayable) {
    return error('matchNotResolved', 'matchControl.matchNotResolved');
  }

  return {
    ok: true,
    value: {
      ...match,
      status: 'IN_PROGRESS',
      startedAt: formatIsoDateTime(clock.nowMs()),
    },
  };
}

export function finishMatch(
  snapshot: TournamentSnapshot,
  matchId: Id,
  clock: Clock,
): Result<Match, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'matchControl.tournamentNotRunning');
  }

  const match = snapshot.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    return error('matchNotFound', 'matchControl.matchNotFound', { matchId });
  }
  if (match.status !== 'IN_PROGRESS') {
    return error('matchNotInProgress', 'matchControl.matchNotInProgress');
  }
  if (match.result === null) {
    return error('matchHasNoResult', 'matchControl.matchHasNoResult');
  }

  return {
    ok: true,
    value: {
      ...match,
      status: 'FINISHED',
      finishedAt: formatIsoDateTime(clock.nowMs()),
    },
  };
}

export function finishDetailMatch(
  snapshot: TournamentSnapshot,
  resolvedMatches: readonly ResolvedMatch[],
  matchId: Id,
  events: readonly MatchEvent[],
  clock: Clock,
): Result<Match, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'matchControl.tournamentNotRunning');
  }

  const match = snapshot.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    return error('matchNotFound', 'matchControl.matchNotFound', { matchId });
  }
  if (match.status !== 'IN_PROGRESS') {
    return error('matchNotInProgress', 'matchControl.matchNotInProgress');
  }

  const resolved = resolvedMatches.find((candidate) => candidate.matchId === matchId);
  if (!resolved?.isPlayable || resolved.homeTeamId === null || resolved.awayTeamId === null) {
    return error('matchNotResolved', 'matchControl.matchNotResolved');
  }

  for (const event of events) {
    const playerResult = validateMatchEventPlayer(event, snapshot.players);
    if (!playerResult.ok) {
      return playerResult;
    }
  }

  const score = computeScore(events, resolved.homeTeamId, resolved.awayTeamId);
  if (!score.ok) {
    return score;
  }

  const stage = snapshot.stages.find((candidate) => candidate.id === match.stageId);
  const isEliminationStage =
    stage?.type === 'KNOCKOUT' ||
    stage?.type === 'CUP' ||
    stage?.type === 'WINNERS_BRACKET' ||
    stage?.type === 'LOSERS_BRACKET' ||
    stage?.type === 'GRAND_FINAL';
  if (isEliminationStage && score.value.home === score.value.away) {
    return error('eliminationTie', 'matchControl.eliminationTie');
  }

  return {
    ok: true,
    value: {
      ...match,
      status: 'FINISHED',
      result: {
        mode: 'DETAIL',
        homePoints: score.value.home,
        awayPoints: score.value.away,
        definition: 'REGULAR',
        winnerTeamId: null,
      },
      finishedAt: formatIsoDateTime(clock.nowMs()),
    },
  };
}

export function finishDirectMatch(
  snapshot: TournamentSnapshot,
  resolvedMatches: readonly ResolvedMatch[],
  matchId: Id,
  homePoints: number,
  awayPoints: number,
  clock: Clock,
): Result<Match, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'matchControl.tournamentNotRunning');
  }

  const match = snapshot.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    return error('matchNotFound', 'matchControl.matchNotFound', { matchId });
  }
  if (match.status !== 'IN_PROGRESS') {
    return error('matchNotInProgress', 'matchControl.matchNotInProgress');
  }
  if (!Number.isInteger(homePoints) || !Number.isInteger(awayPoints) || homePoints < 0 || awayPoints < 0) {
    return error('invalidDirectScore', 'matchControl.invalidDirectScore');
  }

  const resolved = resolvedMatches.find((candidate) => candidate.matchId === matchId);
  if (!resolved?.isPlayable || resolved.homeTeamId === null || resolved.awayTeamId === null) {
    return error('matchNotResolved', 'matchControl.matchNotResolved');
  }

  const stage = snapshot.stages.find((candidate) => candidate.id === match.stageId);
  const isEliminationStage =
    stage?.type === 'KNOCKOUT' ||
    stage?.type === 'CUP' ||
    stage?.type === 'WINNERS_BRACKET' ||
    stage?.type === 'LOSERS_BRACKET' ||
    stage?.type === 'GRAND_FINAL';
  if (isEliminationStage && homePoints === awayPoints) {
    return error('eliminationTie', 'matchControl.eliminationTie');
  }

  return {
    ok: true,
    value: {
      ...match,
      status: 'FINISHED',
      result: {
        mode: 'DIRECT',
        homePoints,
        awayPoints,
        definition: 'REGULAR',
        winnerTeamId: null,
      },
      finishedAt: formatIsoDateTime(clock.nowMs()),
    },
  };
}

export function switchDirectToDetail(
  snapshot: TournamentSnapshot,
  matchId: Id,
  clock: Clock,
): Result<Match, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'matchControl.tournamentNotRunning');
  }

  const match = snapshot.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    return error('matchNotFound', 'matchControl.matchNotFound', { matchId });
  }
  if (match.result?.mode !== 'DIRECT') {
    return error('matchNotDirect', 'matchControl.matchNotDirect');
  }

  return {
    ok: true,
    value: {
      ...match,
      status: 'IN_PROGRESS',
      result: null,
      startedAt: match.startedAt ?? formatIsoDateTime(clock.nowMs()),
      finishedAt: null,
    },
  };
}

export function buildMatchControlView(
  snapshot: TournamentSnapshot,
  resolvedMatches: readonly ResolvedMatch[],
  orderedMatchIds: readonly Id[],
): MatchControlView {
  const matchesById = new Map(snapshot.matches.map((match) => [match.id, match]));
  const resolvedById = new Map(resolvedMatches.map((match) => [match.matchId, match]));
  const currentMatch = snapshot.matches.find((match) => match.status === 'IN_PROGRESS');
  const current =
    currentMatch && resolvedById.get(currentMatch.id)
      ? { match: currentMatch, resolved: resolvedById.get(currentMatch.id)! }
      : null;

  const playablePending = orderedMatchIds
    .map((matchId) => {
      const match = matchesById.get(matchId);
      const resolved = resolvedById.get(matchId);
      return match && resolved?.isPlayable && match.status === 'PENDING'
        ? { match, resolved }
        : null;
    })
    .filter(
      (entry): entry is { readonly match: Match; readonly resolved: ResolvedMatch } =>
        entry !== null,
    );

  return {
    current,
    next: playablePending[0] ?? null,
    following: playablePending.slice(1, 4),
  };
}
