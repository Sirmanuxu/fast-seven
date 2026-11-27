import { ComputeScore, DomainError, Id, MatchEvent, Player, Result, RUGBY_POINTS } from './model';

function error(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return {
    ok: false,
    error: {
      code,
      messageKey: `matchEvents.${code}`,
      ...(params ? { params } : {}),
    },
  };
}

function countEvents(
  events: readonly MatchEvent[],
  teamId: Id,
): { tries: number; conversions: number } {
  return events.reduce(
    (counts, event) => {
      if (event.teamId !== teamId) {
        return counts;
      }

      if (event.type === 'TRY') {
        return { ...counts, tries: counts.tries + 1 };
      }
      return { ...counts, conversions: counts.conversions + 1 };
    },
    { tries: 0, conversions: 0 },
  );
}

function validateEventTeams(
  events: readonly MatchEvent[],
  homeTeamId: Id,
  awayTeamId: Id,
): Result<null, DomainError> {
  if (homeTeamId === awayTeamId) {
    return error('sameTeam');
  }

  if (events.some((event) => event.teamId !== homeTeamId && event.teamId !== awayTeamId)) {
    return error('teamNotInMatch');
  }

  return { ok: true, value: null };
}

export const computeScore: ComputeScore = (events, homeTeamId, awayTeamId) => {
  const teamsResult = validateEventTeams(events, homeTeamId, awayTeamId);
  if (!teamsResult.ok) {
    return teamsResult;
  }

  const home = countEvents(events, homeTeamId);
  const away = countEvents(events, awayTeamId);
  if (home.conversions > home.tries || away.conversions > away.tries) {
    return error('conversionsExceedTries');
  }

  return {
    ok: true,
    value: {
      home: home.tries * RUGBY_POINTS.try + home.conversions * RUGBY_POINTS.conversion,
      away: away.tries * RUGBY_POINTS.try + away.conversions * RUGBY_POINTS.conversion,
    },
  };
};

export function canAddConversion(events: readonly MatchEvent[], teamId: Id): boolean {
  const counts = countEvents(events, teamId);
  return counts.conversions < counts.tries;
}

export function removeMatchEvent(
  events: readonly MatchEvent[],
  eventId: Id,
  homeTeamId: Id,
  awayTeamId: Id,
): Result<readonly MatchEvent[], DomainError> {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) {
    return error('eventNotFound');
  }

  const remaining = events.filter((candidate) => candidate.id !== eventId);
  const scoreResult = computeScore(remaining, homeTeamId, awayTeamId);
  if (!scoreResult.ok) {
    return error('removeTryFirst', { eventId });
  }

  return { ok: true, value: remaining };
}

export function validateMatchEventPlayer(
  event: Pick<MatchEvent, 'teamId' | 'playerId'>,
  players: readonly Player[],
): Result<null, DomainError> {
  if (event.playerId === null) {
    return { ok: true, value: null };
  }

  const player = players.find((candidate) => candidate.id === event.playerId);
  if (!player || player.teamId !== event.teamId) {
    return error('playerNotInTeam');
  }

  return { ok: true, value: null };
}

export function addMatchEvent(
  events: readonly MatchEvent[],
  event: MatchEvent,
  homeTeamId: Id,
  awayTeamId: Id,
  players: readonly Player[],
): Result<readonly MatchEvent[], DomainError> {
  const teamsResult = validateEventTeams(events, homeTeamId, awayTeamId);
  if (!teamsResult.ok) {
    return teamsResult;
  }
  if (event.teamId !== homeTeamId && event.teamId !== awayTeamId) {
    return error('teamNotInMatch');
  }

  const playerResult = validateMatchEventPlayer(event, players);
  if (!playerResult.ok) {
    return playerResult;
  }

  if (event.type === 'CONVERSION' && !canAddConversion(events, event.teamId)) {
    return error('conversionsExceedTries');
  }

  const nextEvents = [...events, event];
  const scoreResult = computeScore(nextEvents, homeTeamId, awayTeamId);
  return scoreResult.ok ? { ok: true, value: nextEvents } : scoreResult;
}
