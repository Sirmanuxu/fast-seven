import { describe, expect, it } from 'vitest';
import { analyzeEditImpact, analyzeEditImpactWithDraws } from './edit-impact';
import {
  DEFAULT_TIEBREAKERS,
  Group,
  MatchEvent,
  Match,
  MatchResult,
  Team,
  TournamentSnapshot,
} from './model';

const rules = {
  points: {
    win: 3,
    draw: 2,
    loss: 1,
    walkoverLoss: 0,
    bonus: {
      triesThreshold: null,
      triesBonusPoints: 0,
      losingMarginMax: null,
      losingBonusPoints: 0,
    },
  },
  tiebreakers: DEFAULT_TIEBREAKERS,
  walkoverScore: { winner: 28, loser: 0 },
  bye: { awardsWinPoints: true, countsScore: false },
  roster: { min: 7, max: 12 },
} as const;

function team(id: string): Team {
  return {
    id,
    name: id,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed: false,
    status: 'ACTIVE',
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

function match(
  id: string,
  order: number,
  home: Match['home'],
  away: Match['away'],
  result: MatchResult | null,
  status: Match['status'] = 'FINISHED',
): Match {
  return {
    id,
    stageId: 'group-stage',
    groupId: 'group-a',
    round: 1,
    order,
    label: null,
    home,
    away,
    status,
    result,
    startedAt: status === 'IN_PROGRESS' ? '2026-11-26T10:00:00.000Z' : null,
    finishedAt: status === 'FINISHED' ? '2026-11-26T10:20:00.000Z' : null,
    isPhantom: false,
    isConditional: false,
  };
}

function groupMatch(
  id: string,
  order: number,
  home: string,
  away: string,
  homePoints: number,
  awayPoints: number,
  groupId = 'group-a',
): Match {
  return {
    ...match(
      id,
      order,
      { kind: 'TEAM', teamId: home },
      { kind: 'TEAM', teamId: away },
      directResult(homePoints, awayPoints),
    ),
    groupId,
  };
}

function fixture(): TournamentSnapshot {
  const groups: Group[] = [
    { id: 'group-a', stageId: 'group-stage', name: 'A', teamIds: ['A', 'B', 'C', 'D'] },
    { id: 'group-b', stageId: 'group-stage', name: 'B', teamIds: ['X', 'Y'] },
  ];
  const semi = {
    ...match(
      'semi',
      8,
      { kind: 'GROUP_POSITION', groupId: 'group-a', position: 2 },
      { kind: 'GROUP_POSITION', groupId: 'group-b', position: 1 },
      directResult(7, 0),
    ),
    stageId: 'knockout',
    groupId: null,
  };
  const final = {
    ...match(
      'final',
      9,
      { kind: 'WINNER_OF', matchId: 'semi' },
      { kind: 'TEAM', teamId: 'Z' },
      directResult(12, 0),
    ),
    stageId: 'knockout',
    groupId: null,
  };
  return {
    tournament: {
      id: 'tournament',
      name: 'Tournament',
      date: '2026-11-26T00:00:00.000Z',
      status: 'RUNNING',
      formatParams: null,
      rules,
      schedule: { startTime: null, matchDurationMin: 20, restMin: 5, breaks: [] },
      categories: [],
      backupIntervalMin: 10,
      schemaVersion: 1,
      createdAt: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-26T00:00:00.000Z',
    },
    players: [],
    teams: ['A', 'B', 'C', 'D', 'X', 'Y', 'Z'].map(team),
    stages: [],
    groups,
    matches: [
      groupMatch('match-1', 1, 'A', 'B', 21, 7),
      groupMatch('match-2', 2, 'C', 'D', 14, 14),
      groupMatch('match-3', 3, 'A', 'C', 12, 10),
      groupMatch('match-4', 4, 'B', 'D', 17, 5),
      groupMatch('match-5', 5, 'A', 'D', 5, 19),
      groupMatch('match-6', 6, 'B', 'C', 7, 7),
      groupMatch('match-7', 7, 'X', 'Y', 20, 10, 'group-b'),
      semi,
      final,
    ],
    events: [],
    draws: [],
  };
}

function updated(
  before: TournamentSnapshot,
  matchId: string,
  result: MatchResult,
): TournamentSnapshot {
  return {
    ...before,
    matches: before.matches.map((entry) => (entry.id === matchId ? { ...entry, result } : entry)),
  };
}

describe('analyzeEditImpact', () => {
  it('lists the changed second-place qualifier and the played semifinal and final it affects', () => {
    const before = fixture();
    const after = updated(before, 'match-6', directResult(7, 10));

    expect(analyzeEditImpact(before, after)).toEqual({
      affected: [
        {
          matchId: 'semi',
          status: 'FINISHED',
          beforeHomeTeamId: 'B',
          beforeAwayTeamId: 'X',
          afterHomeTeamId: 'D',
          afterAwayTeamId: 'X',
          losesResult: true,
        },
        {
          matchId: 'final',
          status: 'FINISHED',
          beforeHomeTeamId: 'B',
          beforeAwayTeamId: 'Z',
          afterHomeTeamId: 'D',
          afterAwayTeamId: 'Z',
          losesResult: true,
        },
      ],
    });
  });

  it('returns no affected matches when a score edit preserves the table and qualifiers', () => {
    const before = fixture();
    const after = updated(before, 'match-4', directResult(20, 5));

    expect(analyzeEditImpact(before, after)).toEqual({ affected: [] });
  });

  it('does not report a cascade when only a try author changes', () => {
    const before = fixture();
    const detailedMatch = {
      ...before.matches[0],
      result: { ...before.matches[0].result!, mode: 'DETAIL' as const },
    };
    const events: MatchEvent[] = [
      ...[1, 2, 3].map((number) => ({
        id: `a-try-${number}`,
        matchId: 'match-1',
        teamId: 'A',
        type: 'TRY' as const,
        playerId: null,
        createdAt: '2026-11-26T10:00:00.000Z',
      })),
      ...[1, 2, 3].map((number) => ({
        id: `a-conversion-${number}`,
        matchId: 'match-1',
        teamId: 'A',
        type: 'CONVERSION' as const,
        playerId: null,
        createdAt: '2026-11-26T10:00:00.000Z',
      })),
      {
        id: 'b-try',
        matchId: 'match-1',
        teamId: 'B',
        type: 'TRY',
        playerId: null,
        createdAt: '2026-11-26T10:00:00.000Z',
      },
      {
        id: 'b-conversion',
        matchId: 'match-1',
        teamId: 'B',
        type: 'CONVERSION',
        playerId: null,
        createdAt: '2026-11-26T10:00:00.000Z',
      },
    ];
    const detailedBefore: TournamentSnapshot = {
      ...before,
      players: [
        {
          id: 'player-a',
          firstName: 'Player',
          lastName: 'A',
          category: 'M16',
          gender: 'M',
          teamId: 'A',
          disambiguation: null,
          normalizedKey: 'player a m16',
        },
      ],
      matches: before.matches.map((entry) => (entry.id === 'match-1' ? detailedMatch : entry)),
      events,
    };
    const detailedAfter: TournamentSnapshot = {
      ...detailedBefore,
      events: events.map((event) =>
        event.id === 'a-try-1' ? { ...event, playerId: 'player-a' } : event,
      ),
    };

    expect(analyzeEditImpact(detailedBefore, detailedAfter)).toEqual({ affected: [] });
  });

  it('renews a persisted draw when the tied team set changes', () => {
    const before = fixture();
    const withDrawTiebreaker: TournamentSnapshot = {
      ...before,
      tournament: {
        ...before.tournament,
        rules: { ...before.tournament.rules, tiebreakers: ['DRAW'] as const },
      },
    };
    const after = updated(withDrawTiebreaker, 'match-6', directResult(7, 10));
    const analysis = analyzeEditImpactWithDraws(withDrawTiebreaker, after);

    expect(
      analysis.draws.some(
        (draw) =>
          draw.payload.kind === 'TIEBREAK' &&
          draw.payload.tiedTeamIds.length === 2 &&
          draw.payload.tiedTeamIds.includes('C') &&
          draw.payload.tiedTeamIds.includes('D'),
      ),
    ).toBe(true);
    expect(analysis.impact.affected.map((entry) => entry.matchId)).toContain('semi');
  });

  it('reports an in-progress affected match so the UI can highlight its reset', () => {
    const before = fixture();
    const inProgress = before.matches.map((entry) =>
      entry.id === 'semi'
        ? { ...entry, status: 'IN_PROGRESS' as const, result: null, finishedAt: null }
        : entry,
    );
    const current = { ...before, matches: inProgress };
    const after = updated(current, 'match-6', directResult(7, 10));
    const impact = analyzeEditImpact(current, after);

    expect(impact.affected[0]).toEqual(
      expect.objectContaining({
        matchId: 'semi',
        status: 'IN_PROGRESS',
        losesResult: false,
      }),
    );
  });
});
