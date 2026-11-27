import {
  Clock,
  Id,
  Match,
  Result,
  ScorerRow,
  Tournament,
  TournamentSnapshot,
} from './model';
import { computeScorers } from './scorers';
import { computeStandings } from './standings';
import { createSeededRng } from './rng';
import { formatIsoDateTime } from './schedule';

export type CloseTournamentError =
  | 'tournamentNotRunning'
  | 'pendingMatches';

export interface FinalTeamPosition {
  readonly teamId: Id;
  readonly position: number;
  readonly tied: boolean;
  readonly tieBreakReason: string | null;
}

export interface FinalTournamentResult {
  readonly championTeamId: Id | null;
  readonly runnerUpTeamId: Id | null;
  readonly podiumTeamIds: readonly Id[];
  readonly positions: readonly FinalTeamPosition[];
  readonly topScorers: readonly ScorerRow[];
}

function isCountedMatch(match: Match): boolean {
  return !match.isPhantom && !match.isConditional;
}

export function canCloseTournament(snapshot: TournamentSnapshot): boolean {
  if (snapshot.tournament.status !== 'RUNNING') return false;
  const counted = snapshot.matches.filter(isCountedMatch);
  return counted.length > 0 && counted.every((match) => match.status === 'FINISHED');
}

export function closeTournament(
  tournament: Tournament,
  matches: readonly Match[],
  clock: Clock,
): Result<Tournament, CloseTournamentError> {
  if (tournament.status !== 'RUNNING') {
    return { ok: false, error: 'tournamentNotRunning' };
  }
  const counted = matches.filter(isCountedMatch);
  if (counted.length === 0 || counted.some((match) => match.status !== 'FINISHED')) {
    return { ok: false, error: 'pendingMatches' };
  }
  return {
    ok: true,
    value: {
      ...tournament,
      status: 'FINISHED',
      updatedAt: formatIsoDateTime(clock.nowMs()),
    },
  };
}

function winnerTeamId(match: Match): Id | null {
  if (match.status !== 'FINISHED' || match.result === null) return null;
  if (match.result.winnerTeamId) return match.result.winnerTeamId;
  if (match.result.homePoints > match.result.awayPoints) {
    return match.home.kind === 'TEAM' ? match.home.teamId : null;
  }
  if (match.result.awayPoints > match.result.homePoints) {
    return match.away.kind === 'TEAM' ? match.away.teamId : null;
  }
  return null;
}

export function reopenTournamentAfterMatchEdit(
  tournament: Tournament,
  matches: readonly Match[],
  updatedAt: string,
): Tournament {
  if (tournament.status !== 'FINISHED') return tournament;
  const hasPending = matches.some(
    (match) => isCountedMatch(match) && match.status !== 'FINISHED',
  );
  return hasPending
    ? { ...tournament, status: 'RUNNING', updatedAt }
    : tournament;
}

export function computeFinalTournamentResult(
  snapshot: TournamentSnapshot,
): FinalTournamentResult {
  const activeTeamIds = snapshot.teams
    .filter((team) => team.status === 'ACTIVE')
    .map((team) => team.id);
  const standings = computeStandings({
    teamIds: activeTeamIds,
    teams: snapshot.teams,
    matches: snapshot.matches,
    events: snapshot.events,
    rules: snapshot.tournament.rules,
    draws: snapshot.draws,
    rng: createSeededRng('final-positions'),
  }).rows;

  const finalStages = snapshot.stages.filter((stage) =>
    ['KNOCKOUT', 'CUP', 'WINNERS_BRACKET', 'LOSERS_BRACKET', 'GRAND_FINAL', 'POSITION_PLAYOFFS'].includes(stage.type),
  );
  const finalStageIds = new Set(finalStages.map((stage) => stage.id));
  const finalMatches = snapshot.matches.filter(
    (match) => finalStageIds.has(match.stageId) && isCountedMatch(match),
  );
  const highestRound = Math.max(0, ...finalMatches.map((match) => match.round));
  const lastRoundMatches = finalMatches.filter((match) => match.round === highestRound);
  const finalMatch =
    lastRoundMatches
      .find((match) => match.stageId === snapshot.stages.find((stage) => stage.type === 'GRAND_FINAL')?.id) ??
    lastRoundMatches[lastRoundMatches.length - 1];

  let championTeamId: Id | null = null;
  let runnerUpTeamId: Id | null = null;
  if (finalMatch) {
    championTeamId = winnerTeamId(finalMatch);
    if (championTeamId !== null) {
      const resolvedIds = finalMatch.result
        ? [finalMatch.home.kind === 'TEAM' ? finalMatch.home.teamId : null,
           finalMatch.away.kind === 'TEAM' ? finalMatch.away.teamId : null]
        : [];
      runnerUpTeamId =
        resolvedIds.find((teamId) => teamId !== null && teamId !== championTeamId) ?? null;
    }
  }

  const eliminationRoundByTeam = new Map<Id, number>();
  for (const match of finalMatches) {
    if (match.status !== 'FINISHED' || match.result === null) continue;
    const winner = winnerTeamId(match);
    for (const ref of [match.home, match.away]) {
      if (ref.kind !== 'TEAM') continue;
      if (ref.teamId !== winner) {
        eliminationRoundByTeam.set(
          ref.teamId,
          Math.max(eliminationRoundByTeam.get(ref.teamId) ?? 0, match.round),
        );
      }
    }
  }

  const orderedTeamIds =
    championTeamId || runnerUpTeamId
      ? [
          championTeamId,
          runnerUpTeamId,
          ...standings
            .map((row) => row.teamId)
            .filter((teamId) => teamId !== championTeamId && teamId !== runnerUpTeamId),
        ].filter((teamId): teamId is Id => teamId !== null)
      : standings.map((row) => row.teamId);

  const positions: FinalTeamPosition[] = [];
  let previousRound: number | null = null;
  let previousPosition = 0;
  orderedTeamIds.forEach((teamId, index) => {
    const round = eliminationRoundByTeam.get(teamId) ?? 0;
    const tied =
      index > 0 &&
      round > 0 &&
      previousRound === round &&
      championTeamId !== teamId &&
      runnerUpTeamId !== teamId;
    const position = tied ? previousPosition : index + 1;
    const standingsRow = standings.find((row) => row.teamId === teamId);
    positions.push({
      teamId,
      position,
      tied,
      tieBreakReason: standingsRow?.tiebreak?.criterion ?? null,
    });
    previousRound = round;
    previousPosition = position;
  });

  const podiumTeamIds = positions
    .filter((position) => position.position <= 3)
    .map((position) => position.teamId);
  const scorers = computeScorers({
    players: snapshot.players,
    matches: snapshot.matches,
    events: snapshot.events,
  }).rows.slice(0, 3);

  return {
    championTeamId,
    runnerUpTeamId,
    podiumTeamIds,
    positions,
    topScorers: scorers,
  };
}
