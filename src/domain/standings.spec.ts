import { describe, expect, it } from 'vitest';
import { computeStandings } from './standings';
import {
  MatchEvent,
  PRESET_POINTS_3_2_1,
  Match,
  MatchRef,
  MatchResult,
  Team,
  TournamentRules,
} from './model';
import { createSeededRng } from './rng';

const rules: TournamentRules = {
  points: PRESET_POINTS_3_2_1,
  tiebreakers: ['POINT_DIFFERENCE', 'POINTS_FOR', 'TRIES_FOR', 'DRAW'],
  walkoverScore: { winner: 28, loser: 0 },
  bye: { awardsWinPoints: true, countsScore: false },
  roster: { min: 7, max: 12 },
};

function teamRef(teamId: string): MatchRef {
  return { kind: 'TEAM', teamId };
}

function match(
  id: string,
  homeTeamId: string,
  awayTeamId: string | null,
  result: MatchResult | null,
  status: Match['status'] = 'FINISHED',
): Match {
  return {
    id,
    stageId: 'stage-1',
    groupId: 'group-1',
    round: 1,
    order: 1,
    label: null,
    home: teamRef(homeTeamId),
    away: awayTeamId === null ? { kind: 'BYE' } : teamRef(awayTeamId),
    status,
    result,
    startedAt: null,
    finishedAt: result ? '2026-11-20T12:00:00.000Z' : null,
    isPhantom: false,
    isConditional: false,
  };
}

function directResult(homePoints: number, awayPoints: number): MatchResult {
  return {
    mode: 'DIRECT',
    homePoints,
    awayPoints,
    definition: 'REGULAR',
    winnerTeamId: null,
  };
}

function team(id: string, status: Team['status'] = 'ACTIVE'): Team {
  return {
    id,
    name: id,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed: false,
    status,
  };
}

function emptyEvents() {
  return [];
}

function tryEvent(id: string, matchId: string, teamId: string): MatchEvent {
  return {
    id,
    matchId,
    teamId,
    type: 'TRY',
    playerId: null,
    createdAt: '2026-11-20T12:00:00.000Z',
  };
}

function standings(
  teamIds: readonly string[],
  matches: readonly Match[],
  teams: readonly Team[] = teamIds.map((id) => team(id)),
) {
  return computeStandings({
    teamIds,
    matches,
    events: emptyEvents(),
    teams,
    rules,
    draws: [],
    rng: createSeededRng('standings-test'),
  }).rows;
}

describe('computeStandings', () => {
  it('returns an empty table with one zero row per team when no matches are finished', () => {
    expect(standings(['a', 'b'], [match('pending', 'a', 'b', null, 'PENDING')])).toEqual([
      expect.objectContaining({
        teamId: 'a',
        position: 1,
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
        withdrawn: false,
      }),
      expect.objectContaining({ teamId: 'b', position: 2 }),
    ]);
  });

  it('counts wins, draws, losses and points for a two-team group', () => {
    const rows = standings(
      ['a', 'b'],
      [
        match('one', 'a', 'b', directResult(21, 7)),
        match('two', 'b', 'a', directResult(10, 10)),
      ],
    );

    expect(rows).toEqual([
      expect.objectContaining({
        teamId: 'a',
        played: 2,
        won: 1,
        drawn: 1,
        lost: 0,
        pointsFor: 31,
        pointsAgainst: 17,
        pointDifference: 14,
        tablePoints: 5,
      }),
      expect.objectContaining({
        teamId: 'b',
        played: 2,
        won: 0,
        drawn: 1,
        lost: 1,
        pointsFor: 17,
        pointsAgainst: 31,
        pointDifference: -14,
        tablePoints: 3,
      }),
    ]);
  });

  it('awards detail and losing bonuses only when their rules are met', () => {
    const bonusRules: TournamentRules = {
      ...rules,
      points: {
        ...rules.points,
        win: 4,
        draw: 2,
        loss: 0,
        bonus: { triesThreshold: 4, triesBonusPoints: 1, losingMarginMax: 7, losingBonusPoints: 1 },
      },
    };
    const rows = computeStandings({
      teamIds: ['a', 'b'],
      matches: [match('one', 'a', 'b', directResult(12, 5))],
      events: [],
      teams: [team('a'), team('b')],
      rules: bonusRules,
      draws: [],
      rng: createSeededRng('bonus-test'),
    }).rows;

    expect(rows[0]).toEqual(expect.objectContaining({ teamId: 'a', bonusPoints: 0, tablePoints: 4 }));
    expect(rows[1]).toEqual(expect.objectContaining({ teamId: 'b', bonusPoints: 1, tablePoints: 1 }));
  });

  it('counts tries and awards the offensive bonus only for detail matches', () => {
    const bonusRules: TournamentRules = {
      ...rules,
      points: {
        ...rules.points,
        bonus: { triesThreshold: 4, triesBonusPoints: 1, losingMarginMax: null, losingBonusPoints: 0 },
      },
    };
    const rows = computeStandings({
      teamIds: ['a', 'b'],
      matches: [
        match('detail', 'a', 'b', {
          mode: 'DETAIL',
          homePoints: 28,
          awayPoints: 21,
          definition: 'REGULAR',
          winnerTeamId: null,
        }),
      ],
      events: [
        ...Array.from({ length: 4 }, (_, index) => tryEvent(`a-${index}`, 'detail', 'a')),
        ...Array.from({ length: 3 }, (_, index) => tryEvent(`b-${index}`, 'detail', 'b')),
      ],
      teams: [team('a'), team('b')],
      rules: bonusRules,
      draws: [],
      rng: createSeededRng('detail-test'),
    }).rows;

    expect(rows[0]).toEqual(
      expect.objectContaining({ teamId: 'a', triesFor: 4, bonusPoints: 1, tablePoints: 4 }),
    );
    expect(rows[1]).toEqual(expect.objectContaining({ teamId: 'b', triesFor: 3, bonusPoints: 0 }));
  });

  it('uses the configured walkover score and walkover loss points', () => {
    const walkoverRules: TournamentRules = {
      ...rules,
      points: { ...rules.points, walkoverLoss: 0 },
    };
    const rows = computeStandings({
      teamIds: ['a', 'b'],
      matches: [
        match('wo', 'a', 'b', {
          mode: 'WALKOVER',
          homePoints: 0,
          awayPoints: 28,
          definition: 'WALKOVER',
          winnerTeamId: 'b',
        }),
      ],
      events: [],
      teams: [team('a'), team('b')],
      rules: walkoverRules,
      draws: [],
      rng: createSeededRng('walkover-test'),
    }).rows;

    expect(rows[0]).toEqual(
      expect.objectContaining({ teamId: 'b', played: 1, won: 1, pointsFor: 28, tablePoints: 3 }),
    );
    expect(rows[1]).toEqual(
      expect.objectContaining({ teamId: 'a', played: 1, lost: 1, pointsAgainst: 28, tablePoints: 0 }),
    );
  });

  it('counts a bye as a played win without changing scores when configured not to count score', () => {
    const rows = standings(['a', 'b'], [match('bye', 'a', null, directResult(0, 0))]);

    expect(rows[0]).toEqual(
      expect.objectContaining({
        teamId: 'a',
        played: 1,
        won: 1,
        pointsFor: 0,
        pointsAgainst: 0,
        tablePoints: 3,
      }),
    );
    expect(rows[1]).toEqual(expect.objectContaining({ teamId: 'b', played: 0, tablePoints: 0 }));
  });

  it('keeps withdrawn teams in the table and marks them', () => {
    expect(standings(['a'], [], [team('a', 'WITHDRAWN')])[0]).toEqual(
      expect.objectContaining({ teamId: 'a', withdrawn: true }),
    );
  });
});
