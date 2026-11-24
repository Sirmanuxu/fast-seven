import { describe, expect, it } from 'vitest';
import { compareAcrossGroups } from './compare-across-groups';
import { Group, Match, MatchRef, MatchResult, TournamentRules, PRESET_POINTS_3_2_1 } from './model';

const rules: TournamentRules = {
  points: PRESET_POINTS_3_2_1,
  tiebreakers: ['HEAD_TO_HEAD', 'POINT_DIFFERENCE', 'POINTS_FOR', 'TRIES_FOR', 'DRAW'],
  walkoverScore: { winner: 28, loser: 0 },
  bye: { awardsWinPoints: true, countsScore: false },
  roster: { min: 7, max: 12 },
};

function teamRef(teamId: string): MatchRef {
  return { kind: 'TEAM', teamId };
}

function result(homePoints: number, awayPoints: number): MatchResult {
  return { mode: 'DIRECT', homePoints, awayPoints, definition: 'REGULAR', winnerTeamId: null };
}

function match(
  id: string,
  groupId: string,
  homeTeamId: string,
  awayTeamId: string,
  homePoints: number,
  awayPoints: number,
  status: Match['status'] = 'FINISHED',
): Match {
  return {
    id,
    stageId: 'groups',
    groupId,
    round: 1,
    order: 1,
    label: null,
    home: teamRef(homeTeamId),
    away: teamRef(awayTeamId),
    status,
    result: status === 'FINISHED' ? result(homePoints, awayPoints) : null,
    startedAt: null,
    finishedAt: status === 'FINISHED' ? '2026-11-20T12:00:00.000Z' : null,
    isPhantom: false,
    isConditional: false,
  };
}

function group(id: string, teamIds: readonly string[]): Group {
  return { id, stageId: 'groups', name: id, teamIds };
}

describe('compareAcrossGroups', () => {
  it('ranks positions in a 4-4-3 configuration after excluding each larger group last place', () => {
    const groups = [
      group('A', ['A1', 'A2', 'A3', 'A4']),
      group('B', ['B1', 'B2', 'B3', 'B4']),
      group('C', ['C1', 'C2', 'C3']),
    ];
    const matches = [
      match('A12', 'A', 'A1', 'A2', 10, 7),
      match('A13', 'A', 'A1', 'A3', 14, 0),
      match('A14', 'A', 'A1', 'A4', 21, 0),
      match('A23', 'A', 'A2', 'A3', 12, 5),
      match('A24', 'A', 'A2', 'A4', 28, 7),
      match('A34', 'A', 'A3', 'A4', 10, 5),
      match('B12', 'B', 'B1', 'B2', 7, 5),
      match('B13', 'B', 'B1', 'B3', 12, 12),
      match('B14', 'B', 'B1', 'B4', 19, 7),
      match('B23', 'B', 'B2', 'B3', 14, 7),
      match('B24', 'B', 'B2', 'B4', 5, 0),
      match('B34', 'B', 'B3', 'B4', 21, 14),
      match('C12', 'C', 'C1', 'C2', 10, 7),
      match('C13', 'C', 'C1', 'C3', 19, 5),
      match('C23', 'C', 'C2', 'C3', 17, 10),
    ];

    const first = compareAcrossGroups({ groups, matches, events: [], rules, level: 1 });
    const second = compareAcrossGroups({ groups, matches, events: [], rules, level: 2 });

    expect(first.ranking.map((row) => row.teamId)).toEqual(['C1', 'A1', 'B1']);
    expect(second.ranking.map((row) => row.teamId)).toEqual(['B2', 'C2', 'A2']);
    expect(first.excludedMatchIds).toHaveLength(6);
    expect(first.isProvisional).toBe(false);
  });

  it('excludes only the last team of the larger group in a 5-4-4-4 configuration', () => {
    const groups = [
      group('A', ['A1', 'A2', 'A3', 'A4', 'A5']),
      group('B', ['B1', 'B2', 'B3', 'B4']),
      group('C', ['C1', 'C2', 'C3', 'C4']),
      group('D', ['D1', 'D2', 'D3', 'D4']),
    ];
    const matches = [
      match('A12', 'A', 'A1', 'A2', 10, 0),
      match('A13', 'A', 'A1', 'A3', 10, 0),
      match('A14', 'A', 'A1', 'A4', 10, 0),
      match('A15', 'A', 'A1', 'A5', 10, 0),
      match('A23', 'A', 'A2', 'A3', 10, 0),
      match('A24', 'A', 'A2', 'A4', 10, 0),
      match('A25', 'A', 'A2', 'A5', 10, 0),
      match('A34', 'A', 'A3', 'A4', 10, 0),
      match('A35', 'A', 'A3', 'A5', 10, 0),
      match('A45', 'A', 'A4', 'A5', 10, 0),
      ...['B', 'C', 'D'].flatMap((groupId) => [
        match(`${groupId}12`, groupId, `${groupId}1`, `${groupId}2`, 10, 0),
        match(`${groupId}13`, groupId, `${groupId}1`, `${groupId}3`, 10, 0),
        match(`${groupId}14`, groupId, `${groupId}1`, `${groupId}4`, 10, 0),
        match(`${groupId}23`, groupId, `${groupId}2`, `${groupId}3`, 10, 0),
        match(`${groupId}24`, groupId, `${groupId}2`, `${groupId}4`, 10, 0),
        match(`${groupId}34`, groupId, `${groupId}3`, `${groupId}4`, 10, 0),
      ]),
    ];

    const comparison = compareAcrossGroups({ groups, matches, events: [], rules, level: 1 });

    expect(comparison.excludedMatchIds).toEqual(['A15', 'A25', 'A35', 'A45']);
    expect(comparison.ranking.map((row) => row.teamId)).toEqual(['A1', 'B1', 'C1', 'D1']);
  });

  it('marks the comparison provisional when a group still has a pending match', () => {
    const groups = [group('A', ['A1', 'A2']), group('B', ['B1', 'B2'])];
    const matches = [
      match('A12', 'A', 'A1', 'A2', 10, 0),
      match('B12', 'B', 'B1', 'B2', 0, 0, 'PENDING'),
    ];

    expect(compareAcrossGroups({ groups, matches, events: [], rules, level: 1 }).isProvisional).toBe(
      true,
    );
  });
});
