import {
  ComputeStandings,
  Id,
  Match,
  MatchEvent,
  MatchRef,
  StandingsRow,
} from './model';

interface MutableRow {
  readonly teamId: Id;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  triesFor: number;
  triesIncomplete: boolean;
  bonusPoints: number;
  tablePoints: number;
  withdrawn: boolean;
  tiebreak: null;
}

function teamIdFromRef(ref: MatchRef): Id | null {
  return ref.kind === 'TEAM' ? ref.teamId : null;
}

function countTries(events: readonly MatchEvent[], matchId: Id, teamId: Id): number {
  return events.filter(
    (event) => event.matchId === matchId && event.teamId === teamId && event.type === 'TRY',
  ).length;
}

function addScore(row: MutableRow, pointsFor: number, pointsAgainst: number): void {
  row.pointsFor += pointsFor;
  row.pointsAgainst += pointsAgainst;
  row.pointDifference = row.pointsFor - row.pointsAgainst;
}

function applyBye(row: MutableRow, rules: Parameters<ComputeStandings>[0]['rules']): void {
  row.played += 1;
  row.won += 1;
  if (rules.bye.awardsWinPoints) {
    row.tablePoints += rules.points.win;
  }
  if (rules.bye.countsScore) {
    addScore(row, rules.walkoverScore.winner, rules.walkoverScore.loser);
  }
}

function applyMatchResult(
  home: MutableRow,
  away: MutableRow,
  match: Match,
  events: readonly MatchEvent[],
  rules: Parameters<ComputeStandings>[0]['rules'],
): void {
  const result = match.result;
  if (!result) {
    return;
  }

  const isWalkover = result.definition === 'WALKOVER' || result.mode === 'WALKOVER';
  const homeTries = countTries(events, match.id, home.teamId);
  const awayTries = countTries(events, match.id, away.teamId);
  if (result.mode === 'DIRECT') {
    home.triesIncomplete = true;
    away.triesIncomplete = true;
  }
  if (result.mode === 'DETAIL') {
    home.triesFor += homeTries;
    away.triesFor += awayTries;
  }

  home.played += 1;
  away.played += 1;
  addScore(home, result.homePoints, result.awayPoints);
  addScore(away, result.awayPoints, result.homePoints);

  if (result.homePoints === result.awayPoints && !isWalkover) {
    home.drawn += 1;
    away.drawn += 1;
    home.tablePoints += rules.points.draw;
    away.tablePoints += rules.points.draw;
  } else {
    const winnerId =
      result.winnerTeamId ??
      (result.homePoints > result.awayPoints ? home.teamId : away.teamId);
    const winner = winnerId === home.teamId ? home : away;
    const loser = winner === home ? away : home;
    winner.won += 1;
    loser.lost += 1;
    winner.tablePoints += rules.points.win;
    loser.tablePoints += isWalkover ? rules.points.walkoverLoss : rules.points.loss;
  }

  if (isWalkover) {
    return;
  }

  const bonus = rules.points.bonus;
  if (bonus.triesThreshold !== null && result.mode === 'DETAIL') {
    if (homeTries >= bonus.triesThreshold) {
      home.bonusPoints += bonus.triesBonusPoints;
      home.tablePoints += bonus.triesBonusPoints;
    }
    if (awayTries >= bonus.triesThreshold) {
      away.bonusPoints += bonus.triesBonusPoints;
      away.tablePoints += bonus.triesBonusPoints;
    }
  }
  if (bonus.losingMarginMax !== null && result.homePoints !== result.awayPoints) {
    const loser = result.homePoints < result.awayPoints ? home : away;
    const margin = Math.abs(result.homePoints - result.awayPoints);
    if (margin <= bonus.losingMarginMax) {
      loser.bonusPoints += bonus.losingBonusPoints;
      loser.tablePoints += bonus.losingBonusPoints;
    }
  }
}

export const computeStandings: ComputeStandings = ({
  teamIds,
  teams,
  matches,
  events,
  rules,
}) => {
  const statusByTeam = new Map(teams.map((team) => [team.id, team.status]));
  const rows = new Map<Id, MutableRow>(
    teamIds.map((teamId) => [
      teamId,
      {
        teamId,
        position: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0,
        triesFor: 0,
        triesIncomplete: false,
        bonusPoints: 0,
        tablePoints: 0,
        withdrawn: statusByTeam.get(teamId) === 'WITHDRAWN',
        tiebreak: null,
      },
    ]),
  );

  for (const match of matches) {
    if (match.status !== 'FINISHED' || match.isPhantom || match.isConditional || !match.result) {
      continue;
    }
    const homeTeamId = teamIdFromRef(match.home);
    const awayTeamId = teamIdFromRef(match.away);
    if (!homeTeamId || !rows.has(homeTeamId)) {
      continue;
    }
    const home = rows.get(homeTeamId);
    if (!home) {
      continue;
    }
    if (match.away.kind === 'BYE') {
      applyBye(home, rules);
      continue;
    }
    if (!awayTeamId || !rows.has(awayTeamId)) {
      continue;
    }
    const away = rows.get(awayTeamId);
    if (away) {
      applyMatchResult(home, away, match, events, rules);
    }
  }

  const ordered = [...rows.values()].sort(
    (left, right) =>
      right.tablePoints - left.tablePoints ||
      right.pointDifference - left.pointDifference ||
      right.pointsFor - left.pointsFor ||
      teamIds.indexOf(left.teamId) - teamIds.indexOf(right.teamId),
  );
  const finalizedRows: StandingsRow[] = ordered.map((row, index) => ({
    ...row,
    position: index + 1,
  }));
  return { rows: finalizedRows, newDraws: [] };
};
