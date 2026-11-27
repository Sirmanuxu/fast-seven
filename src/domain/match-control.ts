import {
  Clock,
  DomainError,
  Id,
  Match,
  MatchEvent,
  MatchResult,
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
  suddenDeathWinnerTeamId: Id | null = null,
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
    if (suddenDeathWinnerTeamId === null) {
      return error('eliminationTie', 'matchControl.eliminationTie');
    }
    if (
      suddenDeathWinnerTeamId !== resolved.homeTeamId &&
      suddenDeathWinnerTeamId !== resolved.awayTeamId
    ) {
      return error('invalidSuddenDeathWinner', 'matchControl.invalidSuddenDeathWinner');
    }
  }

  const isSuddenDeath =
    isEliminationStage && score.value.home === score.value.away && suddenDeathWinnerTeamId !== null;
  return {
    ok: true,
    value: {
      ...match,
      status: 'FINISHED',
      result: {
        mode: 'DETAIL',
        homePoints: score.value.home,
        awayPoints: score.value.away,
        definition: isSuddenDeath ? 'SUDDEN_DEATH' : 'REGULAR',
        winnerTeamId: isSuddenDeath ? suddenDeathWinnerTeamId : null,
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
  suddenDeathWinnerTeamId: Id | null = null,
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
  if (
    !Number.isInteger(homePoints) ||
    !Number.isInteger(awayPoints) ||
    homePoints < 0 ||
    awayPoints < 0
  ) {
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
    if (suddenDeathWinnerTeamId === null) {
      return error('eliminationTie', 'matchControl.eliminationTie');
    }
    if (
      suddenDeathWinnerTeamId !== resolved.homeTeamId &&
      suddenDeathWinnerTeamId !== resolved.awayTeamId
    ) {
      return error('invalidSuddenDeathWinner', 'matchControl.invalidSuddenDeathWinner');
    }
  }

  const isSuddenDeath =
    isEliminationStage && homePoints === awayPoints && suddenDeathWinnerTeamId !== null;
  return {
    ok: true,
    value: {
      ...match,
      status: 'FINISHED',
      result: {
        mode: 'DIRECT',
        homePoints,
        awayPoints,
        definition: isSuddenDeath ? 'SUDDEN_DEATH' : 'REGULAR',
        winnerTeamId: isSuddenDeath ? suddenDeathWinnerTeamId : null,
      },
      finishedAt: formatIsoDateTime(clock.nowMs()),
    },
  };
}

export function finishWalkover(
  snapshot: TournamentSnapshot,
  resolvedMatches: readonly ResolvedMatch[],
  matchId: Id,
  absentTeamId: Id,
  clock: Clock,
  walkoverOrigin?: MatchResult['walkoverOrigin'],
): Result<Match, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'matchControl.tournamentNotRunning');
  }

  const match = snapshot.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    return error('matchNotFound', 'matchControl.matchNotFound', { matchId });
  }
  if (match.status !== 'PENDING' && match.status !== 'IN_PROGRESS') {
    return error('matchNotPending', 'matchControl.matchNotPending');
  }
  if (match.isPhantom || match.isConditional) {
    return error('matchNotPlayable', 'matchControl.matchNotPlayable');
  }

  const resolved = resolvedMatches.find((candidate) => candidate.matchId === matchId);
  if (!resolved?.isPlayable || resolved.homeTeamId === null || resolved.awayTeamId === null) {
    return error('matchNotResolved', 'matchControl.matchNotResolved');
  }
  if (absentTeamId !== resolved.homeTeamId && absentTeamId !== resolved.awayTeamId) {
    return error('invalidAbsentTeam', 'matchControl.invalidAbsentTeam');
  }

  const absentIsHome = absentTeamId === resolved.homeTeamId;
  const { winner, loser } = snapshot.tournament.rules.walkoverScore;
  return {
    ok: true,
    value: {
      ...match,
      status: 'FINISHED',
      result: {
        mode: 'WALKOVER',
        homePoints: absentIsHome ? loser : winner,
        awayPoints: absentIsHome ? winner : loser,
        definition: 'WALKOVER',
        winnerTeamId: absentIsHome ? resolved.awayTeamId : resolved.homeTeamId,
        ...(walkoverOrigin ? { walkoverOrigin } : {}),
      },
      finishedAt: formatIsoDateTime(clock.nowMs()),
    },
  };
}

export function editFinalizedMatch(
  snapshot: TournamentSnapshot,
  resolvedMatches: readonly ResolvedMatch[],
  matchId: Id,
  result: MatchResult,
  events: readonly MatchEvent[],
  clock: Clock,
): Result<{ readonly match: Match; readonly events: readonly MatchEvent[] }, DomainError> {
  if (
    snapshot.tournament.status !== 'RUNNING' &&
    snapshot.tournament.status !== 'FINISHED'
  ) {
    return error('tournamentNotRunning', 'matchControl.tournamentNotRunning');
  }

  const match = snapshot.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    return error('matchNotFound', 'matchControl.matchNotFound', { matchId });
  }
  if (match.status !== 'FINISHED' || match.result === null) {
    return error('matchNotFinished', 'matchControl.matchNotFinished');
  }
  if (
    !Number.isInteger(result.homePoints) ||
    !Number.isInteger(result.awayPoints) ||
    result.homePoints < 0 ||
    result.awayPoints < 0
  ) {
    return error('invalidEditedScore', 'matchControl.invalidEditedScore');
  }

  const resolved = resolvedMatches.find((candidate) => candidate.matchId === matchId);
  if (!resolved?.isPlayable || resolved.homeTeamId === null || resolved.awayTeamId === null) {
    return error('matchNotResolved', 'matchControl.matchNotResolved');
  }
  if (
    events.some((event) => event.matchId !== matchId) ||
    new Set(events.map((event) => event.id)).size !== events.length
  ) {
    return error('invalidEditedEvents', 'matchControl.invalidEditedEvents');
  }
  for (const event of events) {
    const playerResult = validateMatchEventPlayer(event, snapshot.players);
    if (!playerResult.ok) return playerResult;
  }

  if (result.mode === 'DETAIL') {
    const score = computeScore(events, resolved.homeTeamId, resolved.awayTeamId);
    if (
      !score.ok ||
      score.value.home !== result.homePoints ||
      score.value.away !== result.awayPoints
    ) {
      return error('editedEventsDoNotMatchScore', 'matchControl.editedEventsDoNotMatchScore');
    }
  } else if (events.length > 0) {
    return error('invalidEditedEvents', 'matchControl.invalidEditedEvents');
  }

  const stage = snapshot.stages.find((candidate) => candidate.id === match.stageId);
  const isEliminationStage =
    stage?.type === 'KNOCKOUT' ||
    stage?.type === 'CUP' ||
    stage?.type === 'WINNERS_BRACKET' ||
    stage?.type === 'LOSERS_BRACKET' ||
    stage?.type === 'GRAND_FINAL';
  const isTied = result.homePoints === result.awayPoints;
  const isParticipantWinner =
    result.winnerTeamId === resolved.homeTeamId || result.winnerTeamId === resolved.awayTeamId;

  if (result.mode === 'WALKOVER') {
    const absentAtHome = result.winnerTeamId === resolved.awayTeamId;
    const expectedHome = absentAtHome
      ? snapshot.tournament.rules.walkoverScore.loser
      : snapshot.tournament.rules.walkoverScore.winner;
    const expectedAway = absentAtHome
      ? snapshot.tournament.rules.walkoverScore.winner
      : snapshot.tournament.rules.walkoverScore.loser;
    if (
      result.definition !== 'WALKOVER' ||
      !isParticipantWinner ||
      result.homePoints !== expectedHome ||
      result.awayPoints !== expectedAway
    ) {
      return error('invalidEditedWalkover', 'matchControl.invalidEditedWalkover');
    }
  } else if (
    result.definition === 'WALKOVER' ||
    (result.definition === 'SUDDEN_DEATH' &&
      (!isEliminationStage || !isTied || !isParticipantWinner)) ||
    (result.definition === 'REGULAR' && result.winnerTeamId !== null) ||
    (result.definition === 'SUDDEN_DEATH' && result.winnerTeamId === null) ||
    (isEliminationStage && isTied && result.definition !== 'SUDDEN_DEATH')
  ) {
    return error('invalidEditedDefinition', 'matchControl.invalidEditedDefinition');
  }

  return {
    ok: true,
    value: {
      match: {
        ...match,
        result,
        finishedAt: formatIsoDateTime(clock.nowMs()),
      },
      events: [...events],
    },
  };
}

export function undoWalkover(
  snapshot: TournamentSnapshot,
  matchId: Id,
): Result<Match, DomainError> {
  if (snapshot.tournament.status !== 'RUNNING') {
    return error('tournamentNotRunning', 'matchControl.tournamentNotRunning');
  }

  const match = snapshot.matches.find((candidate) => candidate.id === matchId);
  if (!match) {
    return error('matchNotFound', 'matchControl.matchNotFound', { matchId });
  }
  if (
    match.status !== 'FINISHED' ||
    match.result?.mode !== 'WALKOVER' ||
    match.result.definition !== 'WALKOVER'
  ) {
    return error('matchNotWalkover', 'matchControl.matchNotWalkover');
  }
  if (match.result.walkoverOrigin) {
    return error(
      'withdrawalWalkoverMustBeReinstated',
      'matchControl.withdrawalWalkoverMustBeReinstated',
    );
  }

  return {
    ok: true,
    value: {
      ...match,
      status: 'PENDING',
      result: null,
      startedAt: null,
      finishedAt: null,
    },
  };
}

export interface InProgressUndo {
  readonly match: Match;
  readonly events: readonly MatchEvent[];
  readonly shouldOfferFixtureReset: boolean;
}

export function undoMatchInProgress(
  snapshot: TournamentSnapshot,
  matchId: Id,
  preserveEvents: boolean,
): Result<InProgressUndo, DomainError> {
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

  const playableMatches = snapshot.matches
    .filter((candidate) => !candidate.isPhantom && !candidate.isConditional)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const firstMatch = playableMatches[0];
  const noMatchesWereTouched =
    snapshot.matches.every(
      (candidate) => candidate.id === matchId || candidate.status === 'PENDING',
    ) && snapshot.events.every((event) => event.matchId === matchId);
  const shouldOfferFixtureReset = firstMatch?.id === matchId && noMatchesWereTouched;

  return {
    ok: true,
    value: {
      match: {
        ...match,
        status: 'PENDING',
        startedAt: null,
        finishedAt: null,
        result: null,
      },
      events: preserveEvents
        ? snapshot.events.filter((event) => event.matchId === matchId)
        : snapshot.events.filter((event) => event.matchId !== matchId),
      shouldOfferFixtureReset,
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
