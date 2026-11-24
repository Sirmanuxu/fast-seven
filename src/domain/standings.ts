import { ComputeStandings, Draw, Id, Match, MatchEvent, MatchRef, StandingsRow } from './model';

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
  tiebreak: StandingsRow['tiebreak'];
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
      result.winnerTeamId ?? (result.homePoints > result.awayPoints ? home.teamId : away.teamId);
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

function resultWinner(match: Match): Id | null {
  if (!match.result) {
    return null;
  }
  return (
    match.result.winnerTeamId ??
    (match.result.homePoints === match.result.awayPoints
      ? null
      : match.result.homePoints > match.result.awayPoints
        ? teamIdFromRef(match.home)
        : teamIdFromRef(match.away))
  );
}

function miniTablePoints(
  teamIds: readonly Id[],
  matches: readonly Match[],
  rules: Parameters<ComputeStandings>[0]['rules'],
): Readonly<Record<Id, number>> {
  const points = new Map(teamIds.map((teamId) => [teamId, 0]));
  for (const match of matches) {
    if (match.status !== 'FINISHED' || match.isPhantom || match.isConditional || !match.result) {
      continue;
    }
    const homeId = teamIdFromRef(match.home);
    const awayId = teamIdFromRef(match.away);
    if (!homeId || !awayId || !points.has(homeId) || !points.has(awayId)) {
      continue;
    }
    const winnerId = resultWinner(match);
    if (!winnerId) {
      points.set(homeId, (points.get(homeId) ?? 0) + rules.points.draw);
      points.set(awayId, (points.get(awayId) ?? 0) + rules.points.draw);
      continue;
    }
    points.set(winnerId, (points.get(winnerId) ?? 0) + rules.points.win);
    const loserId = winnerId === homeId ? awayId : homeId;
    points.set(
      loserId,
      (points.get(loserId) ?? 0) +
        (match.result.definition === 'WALKOVER' || match.result.mode === 'WALKOVER'
          ? rules.points.walkoverLoss
          : rules.points.loss),
    );
  }
  return Object.fromEntries(points);
}

function buchholzValues(
  teamIds: readonly Id[],
  rows: ReadonlyMap<Id, MutableRow>,
  matches: readonly Match[],
): Readonly<Record<Id, number>> {
  const values = new Map(teamIds.map((teamId) => [teamId, 0]));
  for (const match of matches) {
    if (match.status !== 'FINISHED' || match.isPhantom || match.isConditional || !match.result) {
      continue;
    }
    const homeId = teamIdFromRef(match.home);
    const awayId = teamIdFromRef(match.away);
    if (!homeId || !awayId || !values.has(homeId) || !values.has(awayId)) {
      continue;
    }
    values.set(homeId, (values.get(homeId) ?? 0) + (rows.get(awayId)?.tablePoints ?? 0));
    values.set(awayId, (values.get(awayId) ?? 0) + (rows.get(homeId)?.tablePoints ?? 0));
  }
  return Object.fromEntries(values);
}

function sameTeamSet(left: readonly Id[], right: readonly Id[]): boolean {
  return left.length === right.length && left.every((teamId) => right.includes(teamId));
}

export const computeStandings: ComputeStandings = ({
  teamIds,
  teams,
  matches,
  events,
  rules,
  draws,
  rng,
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

  const newDraws: Draw[] = [];
  const rowById = rows;
  const criteria = [
    ...rules.tiebreakers.filter((criterion) => criterion !== 'DRAW'),
    'DRAW' as const,
  ];
  const valuesFor = (
    criterion: (typeof criteria)[number],
    tiedIds: readonly Id[],
  ): Readonly<Record<Id, number>> | null => {
    if (criterion === 'HEAD_TO_HEAD') {
      return miniTablePoints(tiedIds, matches, rules);
    }
    if (criterion === 'POINT_DIFFERENCE') {
      return Object.fromEntries(
        tiedIds.map((teamId) => [teamId, rowById.get(teamId)?.pointDifference ?? 0]),
      );
    }
    if (criterion === 'POINTS_FOR') {
      return Object.fromEntries(
        tiedIds.map((teamId) => [teamId, rowById.get(teamId)?.pointsFor ?? 0]),
      );
    }
    if (criterion === 'TRIES_FOR') {
      return Object.fromEntries(
        tiedIds.map((teamId) => [teamId, rowById.get(teamId)?.triesFor ?? 0]),
      );
    }
    if (criterion === 'BUCHHOLZ') {
      return buchholzValues(tiedIds, rowById, matches);
    }
    return null;
  };

  const resolveTie = (
    tiedIds: readonly Id[],
    criterionIndex: number,
  ): { readonly ids: readonly Id[]; readonly info: ReadonlyMap<Id, StandingsRow['tiebreak']> } => {
    if (tiedIds.length <= 1) {
      return { ids: tiedIds, info: new Map() };
    }
    for (let index = criterionIndex; index < criteria.length; index += 1) {
      const criterion = criteria[index];
      if (criterion === 'DRAW') {
        const existing = draws.find(
          (draw) =>
            draw.payload.kind === 'TIEBREAK' && sameTeamSet(draw.payload.tiedTeamIds, tiedIds),
        );
        const draw =
          existing ??
          (() => {
            const seed = `tiebreak-${Math.floor(rng.next() * 0xffffffff).toString(16)}`;
            const created: Draw = {
              id: seed,
              seed,
              createdAt: '1970-01-01T00:00:00.000Z',
              payload: {
                kind: 'TIEBREAK',
                tiedTeamIds: [...tiedIds],
                order: rng.shuffle(tiedIds),
              },
            };
            newDraws.push(created);
            return created;
          })();
        if (draw.payload.kind !== 'TIEBREAK') {
          continue;
        }
        const order = draw.payload.order.filter((teamId) => tiedIds.includes(teamId));
        return {
          ids: order,
          info: new Map(
            tiedIds.map((teamId) => [
              teamId,
              { criterion: 'DRAW', comparedTeamIds: [...tiedIds], values: null },
            ]),
          ),
        };
      }

      const values = valuesFor(criterion, tiedIds);
      if (!values) {
        continue;
      }
      const groups = new Map<number, Id[]>();
      for (const teamId of tiedIds) {
        const value = values[teamId] ?? 0;
        const group = groups.get(value) ?? [];
        group.push(teamId);
        groups.set(value, group);
      }
      if (groups.size === 1) {
        continue;
      }

      const orderedGroups = [...groups.entries()].sort(([left], [right]) => right - left);
      const resolved = new Map<Id, StandingsRow['tiebreak']>();
      const orderedIds: Id[] = [];
      for (const [, group] of orderedGroups) {
        if (group.length === 1) {
          const teamId = group[0];
          orderedIds.push(teamId);
          resolved.set(teamId, {
            criterion,
            comparedTeamIds: [...tiedIds],
            values,
          });
        } else {
          const nested = resolveTie(group, index + 1);
          orderedIds.push(...nested.ids);
          for (const [teamId, info] of nested.info) {
            resolved.set(teamId, info);
          }
        }
      }
      return { ids: orderedIds, info: resolved };
    }
    return { ids: [...tiedIds], info: new Map() };
  };

  const byTablePoints = new Map<number, Id[]>();
  for (const teamId of teamIds) {
    const tablePoints = rows.get(teamId)?.tablePoints ?? 0;
    const group = byTablePoints.get(tablePoints) ?? [];
    group.push(teamId);
    byTablePoints.set(tablePoints, group);
  }
  const orderedIds: Id[] = [];
  const tiebreakInfo = new Map<Id, StandingsRow['tiebreak']>();
  for (const [, tiedIds] of [...byTablePoints.entries()].sort(([left], [right]) => right - left)) {
    const resolved = resolveTie(tiedIds, 0);
    orderedIds.push(...resolved.ids);
    for (const [teamId, info] of resolved.info) {
      tiebreakInfo.set(teamId, info);
    }
  }

  const finalizedRows: StandingsRow[] = orderedIds.map((teamId, index) => ({
    ...rows.get(teamId)!,
    position: index + 1,
    tiebreak: tiebreakInfo.get(teamId) ?? null,
  }));
  return { rows: finalizedRows, newDraws };
};
