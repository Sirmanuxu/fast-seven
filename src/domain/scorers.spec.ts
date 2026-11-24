import { describe, expect, it } from 'vitest';
import { computeScorers } from './scorers';
import { Match, MatchEvent, Player, ResultMode } from './model';

const players: readonly Player[] = [
  ['P1', 'Ana', 'Alpha', 'M', 'A'],
  ['P2', 'Beto', 'Bravo', 'M', 'B'],
  ['P3', 'Cata', 'Charlie', 'F', 'A'],
  ['P4', 'Dani', 'Delta', 'F', 'B'],
  ['P5', 'Eva', 'Echo', 'F', 'B'],
  ['P6', 'Fede', 'Foxtrot', 'M', 'A'],
].map(([id, firstName, lastName, gender, teamId]) => ({
  id,
  firstName,
  lastName,
  category: 'M16',
  gender: gender as 'M' | 'F',
  teamId,
  disambiguation: null,
  normalizedKey: `${firstName}|${lastName}|m16`.toLowerCase(),
}));

function match(id: string, mode: ResultMode): Match {
  return {
    id,
    stageId: 'stage-1',
    groupId: 'group-1',
    round: 1,
    order: 1,
    label: null,
    home: { kind: 'TEAM', teamId: 'A' },
    away: { kind: 'TEAM', teamId: 'B' },
    status: 'FINISHED',
    result: {
      mode,
      homePoints: 0,
      awayPoints: 0,
      definition: mode === 'WALKOVER' ? 'WALKOVER' : 'REGULAR',
      winnerTeamId: null,
    },
    startedAt: null,
    finishedAt: null,
    isPhantom: false,
    isConditional: false,
  };
}

function event(
  id: string,
  matchId: string,
  playerId: string | null,
  type: MatchEvent['type'],
  teamId = 'A',
): MatchEvent {
  return { id, matchId, playerId, type, teamId, createdAt: '2026-11-24T00:00:00.000Z' };
}

describe('computeScorers', () => {
  it('orders the reference case by points, tries, then surname', () => {
    const events = [
      ...Array.from({ length: 3 }, (_, index) => event(`p1-t${index}`, 'm1', 'P1', 'TRY')),
      ...Array.from({ length: 2 }, (_, index) => event(`p1-c${index}`, 'm1', 'P1', 'CONVERSION')),
      ...Array.from({ length: 2 }, (_, index) => event(`p2-t${index}`, 'm1', 'P2', 'TRY', 'B')),
      ...Array.from({ length: 4 }, (_, index) =>
        event(`p2-c${index}`, 'm1', 'P2', 'CONVERSION', 'B'),
      ),
      ...Array.from({ length: 4 }, (_, index) => event(`p3-t${index}`, 'm1', 'P3', 'TRY')),
      ...Array.from({ length: 3 }, (_, index) => event(`p5-t${index}`, 'm1', 'P5', 'TRY', 'B')),
      ...Array.from({ length: 6 }, (_, index) =>
        event(`p4-c${index}`, 'm1', 'P4', 'CONVERSION', 'B'),
      ),
      event('p6-t', 'm1', 'P6', 'TRY'),
      ...Array.from({ length: 5 }, (_, index) => event(`p6-c${index}`, 'm1', 'P6', 'CONVERSION')),
    ];

    expect(computeScorers({ players, matches: [match('m1', 'DETAIL')], events })).toEqual({
      rows: [
        { playerId: 'P3', teamId: 'A', tries: 4, conversions: 0, points: 20 },
        { playerId: 'P1', teamId: 'A', tries: 3, conversions: 2, points: 19 },
        { playerId: 'P2', teamId: 'B', tries: 2, conversions: 4, points: 18 },
        { playerId: 'P5', teamId: 'B', tries: 3, conversions: 0, points: 15 },
        { playerId: 'P6', teamId: 'A', tries: 1, conversions: 5, points: 15 },
        { playerId: 'P4', teamId: 'B', tries: 0, conversions: 6, points: 12 },
      ],
      unattributedTries: 0,
    });
  });

  it('excludes unattributed authors from rows and direct or walkover matches', () => {
    const events = [
      event('detail-try', 'detail', 'P1', 'TRY'),
      event('unattributed', 'detail', null, 'TRY'),
      event('direct-try', 'direct', 'P2', 'TRY', 'B'),
      event('walkover-conversion', 'walkover', 'P3', 'CONVERSION'),
    ];

    expect(
      computeScorers({
        players,
        matches: [
          match('detail', 'DETAIL'),
          match('direct', 'DIRECT'),
          match('walkover', 'WALKOVER'),
        ],
        events,
      }),
    ).toEqual({
      rows: [{ playerId: 'P1', teamId: 'A', tries: 1, conversions: 0, points: 5 }],
      unattributedTries: 1,
    });
  });

  it('filters by category and gender and orders equal scores by surname', () => {
    const sameScorePlayers = [
      { ...players[0], category: 'M16', gender: 'M' as const },
      { ...players[1], category: 'M17', gender: 'M' as const, lastName: 'Able' },
    ];
    const filteredResult = computeScorers({
      players: sameScorePlayers,
      matches: [match('m1', 'DETAIL')],
      events: [event('p1', 'm1', 'P1', 'TRY'), event('p2', 'm1', 'P2', 'TRY')],
      filter: { category: 'M16', gender: 'M' },
    });

    expect(filteredResult.rows).toEqual([
      { playerId: 'P1', teamId: 'A', tries: 1, conversions: 0, points: 5 },
    ]);

    expect(
      computeScorers({
        players: sameScorePlayers,
        matches: [match('m1', 'DETAIL')],
        events: [event('p1', 'm1', 'P1', 'TRY'), event('p2', 'm1', 'P2', 'TRY')],
      }).rows.map((row) => row.playerId),
    ).toEqual(['P2', 'P1']);
  });
});
