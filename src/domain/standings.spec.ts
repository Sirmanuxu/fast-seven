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
  PRESET_POINTS_4_2_0_BONUS,
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
  return compute({
    teamIds,
    matches,
    events: emptyEvents(),
    teams,
    rules,
    draws: [],
    rng: createSeededRng('standings-test'),
  }).rows;
}

function compute(
  input: Partial<Parameters<typeof computeStandings>[0]> &
    Pick<Parameters<typeof computeStandings>[0], 'teamIds' | 'matches'>,
) {
  return computeStandings({
    teamIds: input.teamIds,
    matches: input.matches,
    events: input.events ?? emptyEvents(),
    teams: input.teams ?? input.teamIds.map((id) => team(id)),
    rules: input.rules ?? rules,
    draws: input.draws ?? [],
    rng: input.rng ?? createSeededRng('standings-test'),
  });
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
      [match('one', 'a', 'b', directResult(21, 7)), match('two', 'b', 'a', directResult(10, 10))],
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

    expect(rows[0]).toEqual(
      expect.objectContaining({ teamId: 'a', bonusPoints: 0, tablePoints: 4 }),
    );
    expect(rows[1]).toEqual(
      expect.objectContaining({ teamId: 'b', bonusPoints: 1, tablePoints: 1 }),
    );
  });

  it('counts tries and awards the offensive bonus only for detail matches', () => {
    const bonusRules: TournamentRules = {
      ...rules,
      points: {
        ...rules.points,
        bonus: {
          triesThreshold: 4,
          triesBonusPoints: 1,
          losingMarginMax: null,
          losingBonusPoints: 0,
        },
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
      expect.objectContaining({
        teamId: 'a',
        played: 1,
        lost: 1,
        pointsAgainst: 28,
        tablePoints: 0,
      }),
    );
  });

  it('applies the walkover result without bonuses under 4-2-0 scoring', () => {
    const bonusRules: TournamentRules = {
      ...rules,
      points: PRESET_POINTS_4_2_0_BONUS,
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
      rules: bonusRules,
      draws: [],
      rng: createSeededRng('walkover-bonus-test'),
    }).rows;

    expect(rows).toEqual([
      expect.objectContaining({
        teamId: 'b',
        played: 1,
        won: 1,
        pointsFor: 28,
        pointsAgainst: 0,
        triesFor: 0,
        bonusPoints: 0,
        tablePoints: 4,
      }),
      expect.objectContaining({
        teamId: 'a',
        played: 1,
        lost: 1,
        pointsFor: 0,
        pointsAgainst: 28,
        triesFor: 0,
        bonusPoints: 0,
        tablePoints: 0,
      }),
    ]);
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

  it('uses Buchholz for tied Swiss teams', () => {
    const buchholzRules: TournamentRules = {
      ...rules,
      tiebreakers: ['BUCHHOLZ', 'DRAW'],
    };
    const rows = computeStandings({
      teamIds: ['a', 'b', 'c', 'd'],
      matches: [
        match('a-b', 'a', 'b', directResult(10, 0)),
        match('c-d', 'c', 'd', directResult(10, 0)),
      ],
      events: [],
      teams: ['a', 'b', 'c', 'd'].map((id) => team(id)),
      rules: buchholzRules,
      draws: [],
      rng: createSeededRng('buchholz-test'),
    }).rows;

    expect(rows.filter((row) => row.teamId === 'a' || row.teamId === 'c')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ teamId: 'a', tablePoints: 3 }),
        expect.objectContaining({ teamId: 'c', tablePoints: 3 }),
      ]),
    );
  });

  it('keeps withdrawn teams in the table and marks them', () => {
    expect(standings(['a'], [], [team('a', 'WITHDRAWN')])[0]).toEqual(
      expect.objectContaining({ teamId: 'a', withdrawn: true }),
    );
  });

  it('awards a finished phantom Swiss bye without counting it as a played fixture', () => {
    const bye = { ...match('bye-phantom', 'a', null, directResult(0, 0)), isPhantom: true };
    const rows = standings(['a', 'b'], [bye]);

    expect(rows[0]).toMatchObject({
      teamId: 'a',
      played: 1,
      won: 1,
      tablePoints: 3,
      pointsFor: 0,
      pointsAgainst: 0,
    });
  });

  it('uses the configured head-to-head criterion for a two-team tie', () => {
    const result = compute({
      teamIds: ['a', 'b', 'c', 'd'],
      matches: [
        match('1', 'a', 'b', directResult(21, 7)),
        match('2', 'c', 'd', directResult(14, 14)),
        match('3', 'a', 'c', directResult(12, 10)),
        match('4', 'b', 'd', directResult(17, 5)),
        match('5', 'a', 'd', directResult(5, 19)),
        match('6', 'b', 'c', directResult(7, 7)),
      ],
      rules: { ...rules, tiebreakers: ['HEAD_TO_HEAD', 'POINT_DIFFERENCE', 'DRAW'] },
    });

    expect(result.rows.map((row) => row.teamId)).toEqual(['a', 'b', 'd', 'c']);
    expect(result.rows[1]).toEqual(
      expect.objectContaining({
        teamId: 'b',
        tiebreak: {
          criterion: 'HEAD_TO_HEAD',
          comparedTeamIds: ['b', 'd'],
          values: { b: 3, d: 1 },
        },
      }),
    );
  });

  it('restarts criteria after a partial three-team mini-table split', () => {
    const result = compute({
      teamIds: ['a', 'b', 'c', 'd', 'e'],
      matches: [
        match('1', 'a', 'b', directResult(14, 14)),
        match('2', 'a', 'c', directResult(21, 7)),
        match('3', 'b', 'c', directResult(17, 10)),
        match('4', 'a', 'd', directResult(7, 14)),
        match('5', 'b', 'd', directResult(5, 19)),
        match('6', 'a', 'e', directResult(12, 12)),
        match('7', 'b', 'e', directResult(10, 10)),
        match('8', 'c', 'd', directResult(14, 12)),
        match('9', 'c', 'e', directResult(26, 5)),
        match('10', 'd', 'e', directResult(21, 7)),
      ],
      rules: { ...rules, tiebreakers: ['HEAD_TO_HEAD', 'POINT_DIFFERENCE', 'DRAW'] },
    });

    expect(result.rows.map((row) => row.teamId)).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(result.rows[1].tiebreak).toEqual(
      expect.objectContaining({ criterion: 'POINT_DIFFERENCE', values: { a: 7, b: -7 } }),
    );
    expect(result.rows[3].tiebreak).toEqual(
      expect.objectContaining({ criterion: 'HEAD_TO_HEAD', values: { a: 5, b: 5, c: 2 } }),
    );
  });

  it('persists and reuses a draw only while the tied set is unchanged', () => {
    const tiebreakRules: TournamentRules = {
      ...rules,
      tiebreakers: ['POINT_DIFFERENCE', 'POINTS_FOR', 'TRIES_FOR', 'DRAW'],
    };
    const input = {
      teamIds: ['x', 'y'],
      matches: [match('tie', 'x', 'y', directResult(10, 10))],
      rules: tiebreakRules,
      events: [
        ...Array.from({ length: 2 }, (_, index) => tryEvent(`x-t-${index}`, 'tie', 'x')),
        ...Array.from({ length: 2 }, (_, index) => tryEvent(`y-t-${index}`, 'tie', 'y')),
      ],
    };

    const first = compute(input);
    expect(first.newDraws).toHaveLength(1);
    expect(first.newDraws[0].payload).toEqual(
      expect.objectContaining({ kind: 'TIEBREAK', tiedTeamIds: ['x', 'y'] }),
    );
    expect(first.rows.every((row) => row.tiebreak?.criterion === 'DRAW')).toBe(true);

    const second = compute({ ...input, draws: first.newDraws });
    expect(second.newDraws).toEqual([]);
    expect(second.rows.map((row) => row.teamId)).toEqual(first.rows.map((row) => row.teamId));

    const changed = compute({
      ...input,
      teamIds: ['x', 'y', 'z'],
      teams: [team('x'), team('y'), team('z')],
      matches: [
        ...input.matches,
        match('x-z', 'x', 'z', directResult(10, 10)),
        match('y-z', 'y', 'z', directResult(10, 10)),
      ],
      draws: first.newDraws,
    });
    expect(changed.newDraws).toHaveLength(1);
    expect(changed.newDraws[0].payload).toEqual(
      expect.objectContaining({ kind: 'TIEBREAK', tiedTeamIds: ['x', 'y', 'z'] }),
    );
  });
});
