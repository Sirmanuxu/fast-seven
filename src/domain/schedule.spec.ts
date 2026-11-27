import { describe, expect, it } from 'vitest';
import { generateRoundRobinMatches } from './round-robin';
import { computePersistedSchedule, computeSchedule, computeScheduleDetails } from './schedule';
import { Match, MatchRef, ScheduleConfig, Team, TournamentSnapshot } from './model';

const startTime = '2026-11-24T10:00:00.000Z';

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

function match(
  id: string,
  order: number,
  home: MatchRef,
  away: MatchRef,
  options: Partial<Match> = {},
): Match {
  return {
    id,
    stageId: 'league',
    groupId: null,
    round: 1,
    order,
    label: null,
    home,
    away,
    status: 'PENDING',
    result: null,
    startedAt: null,
    finishedAt: null,
    isPhantom: false,
    isConditional: false,
    ...options,
  };
}

function snapshot(
  teams: readonly Team[],
  matches: readonly Match[],
  schedule: ScheduleConfig = { startTime, matchDurationMin: 20, restMin: 5, breaks: [] },
  options: Partial<TournamentSnapshot> = {},
): TournamentSnapshot {
  return {
    tournament: {
      id: 'tournament',
      name: 'Tournament',
      date: startTime,
      status: 'FIXTURE_GENERATED',
      formatParams: null,
      rules: {
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
        tiebreakers: ['DRAW'],
        walkoverScore: { winner: 28, loser: 0 },
        bye: { awardsWinPoints: true, countsScore: false },
        roster: { min: 7, max: 12 },
      },
      schedule,
      categories: [],
      backupIntervalMin: 10,
      schemaVersion: 1,
      createdAt: startTime,
      updatedAt: startTime,
    },
    players: [],
    teams,
    stages: [{ id: 'league', type: 'LEAGUE', name: 'Liga', order: 1, cup: null }],
    groups: [],
    matches,
    events: [],
    draws: [],
    ...options,
  };
}

function roundRobinSnapshot(teamCount: number): TournamentSnapshot {
  const teams = Array.from({ length: teamCount }, (_, index) => team(`T${index + 1}`));
  const fixture = generateRoundRobinMatches({
    teamIds: teams.map((entry) => entry.id),
    rounds: 1,
    stageId: 'league',
  });
  if (!fixture.ok) throw new Error('Expected round-robin fixture generation to succeed');
  return snapshot(teams, fixture.value);
}

describe('tentative schedule', () => {
  it('orders cup finals from Copper to Gold after non-final cup matches', () => {
    const cups = [
      { id: 'gold', name: 'Copa de Oro', order: 1, cup: 'GOLD' as const, semiRound: 2 },
      { id: 'silver', name: 'Copa de Plata', order: 2, cup: 'SILVER' as const, semiRound: 1 },
      { id: 'bronze', name: 'Copa de Bronce', order: 3, cup: 'BRONZE' as const, semiRound: 3 },
      { id: 'copper', name: 'Copa de Cobre', order: 4, cup: 'COPPER' as const, semiRound: null },
    ];
    const cupMatches = cups.flatMap((cup, index) => {
      if (cup.semiRound === null) {
        return [
          match(
            `${cup.id}-final`,
            index + 1,
            { kind: 'TEAM', teamId: `${cup.id}-a` },
            { kind: 'TEAM', teamId: `${cup.id}-b` },
            {
              stageId: cup.id,
              round: 1,
              label: 'Final',
            },
          ),
        ];
      }
      return [
        match(
          `${cup.id}-semi`,
          index * 2 + 1,
          { kind: 'TEAM', teamId: `${cup.id}-a` },
          { kind: 'TEAM', teamId: `${cup.id}-b` },
          {
            stageId: cup.id,
            round: cup.semiRound,
            label: 'Semifinal',
          },
        ),
        match(
          `${cup.id}-final`,
          index * 2 + 2,
          { kind: 'WINNER_OF', matchId: `${cup.id}-semi` },
          { kind: 'TEAM', teamId: `${cup.id}-c` },
          {
            stageId: cup.id,
            round: cup.semiRound + 1,
            label: 'Final',
          },
        ),
      ];
    });
    const details = computeScheduleDetails(
      snapshot([], cupMatches, undefined, {
        stages: cups.map((cup) => ({
          id: cup.id,
          type: 'CUP',
          name: cup.name,
          order: cup.order,
          cup: cup.cup,
        })),
      }),
      Date.UTC(2026, 10, 26, 10, 0),
      [],
      'SUGGESTED',
    );

    expect(details.orderedMatchIds).toEqual([
      'silver-semi',
      'gold-semi',
      'bronze-semi',
      'copper-final',
      'bronze-final',
      'silver-final',
      'gold-final',
    ]);
  });

  it('schedules five matches from the configured start time and inserts breaks', () => {
    const matches = Array.from({ length: 5 }, (_, index) =>
      match(
        `match-${index + 1}`,
        index + 1,
        { kind: 'TEAM', teamId: `H${index + 1}` },
        { kind: 'TEAM', teamId: `A${index + 1}` },
      ),
    );
    const teams = matches.flatMap((entry) =>
      [entry.home, entry.away].map((ref) => team(ref.kind === 'TEAM' ? ref.teamId : '')),
    );
    const plain = computeSchedule(
      snapshot(teams, matches),
      Date.UTC(2026, 10, 24, 10, 0),
    );
    expect(plain.map((entry) => entry.estimatedStart.slice(11, 16))).toEqual([
      '10:00',
      '10:25',
      '10:50',
      '11:15',
      '11:40',
    ]);

    const withBreak = computeSchedule(
      snapshot(teams, matches, {
        startTime,
        matchDurationMin: 20,
        restMin: 5,
        breaks: [{ id: 'lunch', label: 'Almuerzo', durationMin: 45, beforeMatchId: 'match-4' }],
      }),
      Date.UTC(2026, 10, 24, 10, 0),
    );
    expect(withBreak.map((entry) => entry.estimatedStart.slice(11, 16))).toEqual([
      '10:00',
      '10:25',
      '10:50',
      '12:00',
      '12:25',
    ]);
  });

  it('uses the last real finish or the maximum in-progress end and current time', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')];
    const finished = match(
      'finished',
      1,
      { kind: 'TEAM', teamId: 'A' },
      { kind: 'TEAM', teamId: 'B' },
      {
        status: 'FINISHED',
        finishedAt: '2026-11-24T10:22:00.000Z',
        result: {
          mode: 'DIRECT',
          homePoints: 5,
          awayPoints: 0,
          definition: 'REGULAR',
          winnerTeamId: null,
        },
      },
    );
    const next = match(
      'next',
      2,
      { kind: 'TEAM', teamId: 'C' },
      { kind: 'TEAM', teamId: 'D' },
    );
    expect(
      computeSchedule(snapshot(teams, [finished, next]), Date.UTC(2026, 10, 24, 10, 0))[0]
        .estimatedStart,
    ).toBe('2026-11-24T10:27:00.000Z');

    const finishedConditional = match(
      'finished-conditional',
      2,
      { kind: 'TEAM', teamId: 'A' },
      { kind: 'TEAM', teamId: 'C' },
      {
        status: 'FINISHED',
        finishedAt: '2026-11-24T10:40:00.000Z',
        isConditional: true,
        result: {
          mode: 'DIRECT',
          homePoints: 5,
          awayPoints: 0,
          definition: 'REGULAR',
          winnerTeamId: null,
        },
      },
    );
    expect(
      computeSchedule(snapshot(teams, [finished, finishedConditional, next]), Date.UTC(2026, 10, 24, 10, 0))[0]
        .estimatedStart,
    ).toBe('2026-11-24T10:45:00.000Z');

    const inProgress = match(
      'in-progress',
      1,
      { kind: 'TEAM', teamId: 'A' },
      { kind: 'TEAM', teamId: 'B' },
      { status: 'IN_PROGRESS', startedAt: '2026-11-24T10:10:00.000Z' },
    );
    const nextAfterLive = match(
      'next-live',
      2,
      { kind: 'TEAM', teamId: 'C' },
      { kind: 'TEAM', teamId: 'D' },
    );
    expect(
      computeSchedule(
        snapshot(teams, [inProgress, nextAfterLive]),
        Date.UTC(2026, 10, 24, 10, 35),
      )[0].estimatedStart,
    ).toBe('2026-11-24T10:40:00.000Z');
  });

  it('does not schedule bye, phantom or conditional matches and rolls over UTC dates', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')];
    const matches = [
      match('playable', 1, { kind: 'TEAM', teamId: 'A' }, { kind: 'TEAM', teamId: 'B' }),
      match('bye', 2, { kind: 'TEAM', teamId: 'C' }, { kind: 'BYE' }),
      match('phantom', 3, { kind: 'TEAM', teamId: 'A' }, { kind: 'TEAM', teamId: 'C' }, { isPhantom: true }),
      match('conditional', 4, { kind: 'TEAM', teamId: 'B' }, { kind: 'TEAM', teamId: 'D' }, { isConditional: true }),
    ];
    const schedule = computeSchedule(
      snapshot(teams, matches, { startTime: '2026-11-24T23:50:00.000Z', matchDurationMin: 20, restMin: 5, breaks: [] }),
      Date.UTC(2026, 10, 24, 23, 50),
    );
    expect(schedule).toHaveLength(1);
    expect(schedule[0].matchId).toBe('playable');

    const rollover = computeSchedule(
      snapshot(
        [team('A'), team('B'), team('C'), team('D')],
        [
          match('before-midnight', 1, { kind: 'TEAM', teamId: 'A' }, { kind: 'TEAM', teamId: 'B' }),
          match('after-midnight', 2, { kind: 'TEAM', teamId: 'C' }, { kind: 'TEAM', teamId: 'D' }),
        ],
        { startTime: '2026-11-24T23:50:00.000Z', matchDurationMin: 20, restMin: 5, breaks: [] },
      ),
      Date.UTC(2026, 10, 24, 23, 50),
    );
    expect(rollover[1].estimatedStart).toBe('2026-11-25T00:15:00.000Z');
  });

  it('finds the reference minimum consecutive appearances for round robin n=3..6', () => {
    for (const [teamCount, expected] of [
      [3, 2],
      [4, 2],
      [5, 0],
      [6, 0],
    ]) {
      const details = computeScheduleDetails(
        roundRobinSnapshot(teamCount),
        Date.UTC(2026, 10, 24, 10, 0),
      );
      expect(details.consecutiveAppearances).toHaveLength(expected);
    }
  });

  it('keeps elimination dependencies ahead of dependent matches', () => {
    const teams = [team('A'), team('B'), team('C')];
    const dependent = match(
      'dependent',
      1,
      { kind: 'WINNER_OF', matchId: 'source' },
      { kind: 'TEAM', teamId: 'C' },
    );
    const source = match(
      'source',
      2,
      { kind: 'TEAM', teamId: 'A' },
      { kind: 'TEAM', teamId: 'B' },
    );
    const details = computeScheduleDetails(
      snapshot(teams, [dependent, source], undefined, {
        stages: [{ id: 'league', type: 'KNOCKOUT', name: 'Eliminación', order: 1, cup: null }],
      }),
      Date.UTC(2026, 10, 24, 10, 0),
    );
    expect(details.orderedMatchIds).toEqual(['source', 'dependent']);
  });

  it('recalculates times from the persisted pending-match order', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')];
    const matches = [
      match(
        'round-one',
        2,
        { kind: 'TEAM', teamId: 'A' },
        { kind: 'TEAM', teamId: 'B' },
        { round: 1 },
      ),
      match(
        'round-two',
        1,
        { kind: 'TEAM', teamId: 'C' },
        { kind: 'TEAM', teamId: 'D' },
        { round: 2 },
      ),
    ];
    const tournamentSnapshot = snapshot(teams, matches);

    expect(
      computePersistedSchedule(tournamentSnapshot, Date.UTC(2026, 10, 24, 10, 0)).map(
        (entry) => entry.matchId,
      ),
    ).toEqual(['round-two', 'round-one']);
    expect(
      computeScheduleDetails(tournamentSnapshot, Date.UTC(2026, 10, 24, 10, 0)).orderedMatchIds,
    ).toEqual(['round-one', 'round-two']);
  });

  it('estimates future Swiss matches without adding them to the tournament fixture', () => {
    const teams = [team('A'), team('B'), team('C'), team('D')];
    const currentMatches = [
      match('swiss-1', 1, { kind: 'TEAM', teamId: 'A' }, { kind: 'TEAM', teamId: 'B' }, { stageId: 'swiss', round: 1 }),
      match('swiss-2', 2, { kind: 'TEAM', teamId: 'C' }, { kind: 'TEAM', teamId: 'D' }, { stageId: 'swiss', round: 1 }),
    ];
    const tournamentSnapshot = snapshot(teams, currentMatches, undefined, {
      stages: [{ id: 'swiss', type: 'SWISS', name: 'Suizo', order: 1, cup: null }],
      tournament: {
        ...snapshot(teams, []).tournament,
        formatParams: { format: 'SWISS', rounds: 3 },
      },
    });

    const entries = computeSchedule(
      tournamentSnapshot,
      Date.UTC(2026, 10, 24, 10, 0),
    );
    expect(entries).toHaveLength(6);
    expect(entries.slice(0, 2).every((entry) => !entry.isEstimateOnly)).toBe(true);
    expect(entries.slice(2).every((entry) => entry.isEstimateOnly)).toBe(true);
    expect(entries[2].matchId).toBe('swiss-round-2-match-1-estimate');
  });
});
