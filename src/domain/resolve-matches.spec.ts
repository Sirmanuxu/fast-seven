import { describe, expect, it } from 'vitest';
import { createSeededRng } from './rng';
import { resolveMatches, resolveMatchesWithDraws } from './resolve-matches';
import {
  DEFAULT_TIEBREAKERS,
  Group,
  Match,
  MatchRef,
  MatchResult,
  Team,
  TournamentSnapshot,
  TournamentRules,
} from './model';

const rules: TournamentRules = {
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
};

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

function group(id: string, teamIds: readonly string[]): Group {
  return { id, stageId: 'groups', name: id, teamIds };
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
    stageId: 'groups',
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

function result(
  homePoints: number,
  awayPoints: number,
  winnerTeamId: string | null = null,
): MatchResult {
  return {
    mode: 'DIRECT',
    homePoints,
    awayPoints,
    definition: 'REGULAR',
    winnerTeamId,
  };
}

function snapshot(
  groups: readonly Group[],
  matches: readonly Match[],
  extra: Partial<TournamentSnapshot> = {},
): TournamentSnapshot {
  const teamIds = [...new Set(groups.flatMap((entry) => entry.teamIds))];
  for (const entry of matches) {
    for (const ref of [entry.home, entry.away]) {
      if (ref.kind === 'TEAM' && !teamIds.includes(ref.teamId)) teamIds.push(ref.teamId);
    }
  }
  return {
    tournament: {
      id: 'tournament',
      name: 'Tournament',
      date: '2026-11-24T00:00:00.000Z',
      status: 'SETUP',
      formatParams: null,
      rules,
      schedule: { startTime: null, matchDurationMin: 20, restMin: 5, breaks: [] },
      categories: [],
      backupIntervalMin: 10,
      schemaVersion: 1,
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
    },
    players: [],
    teams: teamIds.map(team),
    stages: [],
    groups,
    matches,
    events: [],
    draws: [],
    ...extra,
  };
}

function finishedGroupMatch(
  id: string,
  order: number,
  groupId: string,
  homeTeamId: string,
  awayTeamId: string,
  homePoints: number,
  awayPoints: number,
): Match {
  return match(
    id,
    order,
    { kind: 'TEAM', teamId: homeTeamId },
    { kind: 'TEAM', teamId: awayTeamId },
    {
      groupId,
      status: 'FINISHED',
      result: result(homePoints, awayPoints),
      finishedAt: '2026-11-24T12:00:00.000Z',
    },
  );
}

describe('resolve match references', () => {
  it('resolves group positions only after every group match is finished', () => {
    const groups = [group('A', ['A1', 'A2']), group('B', ['B1', 'B2'])];
    const playoff = match(
      'playoff',
      3,
      { kind: 'GROUP_POSITION', groupId: 'A', position: 1 },
      { kind: 'GROUP_POSITION', groupId: 'B', position: 1 },
      { stageId: 'playoffs' },
    );
    const complete = snapshot(groups, [
      finishedGroupMatch('a-match', 1, 'A', 'A1', 'A2', 20, 5),
      finishedGroupMatch('b-match', 2, 'B', 'B1', 'B2', 15, 5),
      playoff,
    ]);

    const resolved = resolveMatches(complete, createSeededRng('resolve-complete'));
    expect(resolved[2]).toMatchObject({
      homeTeamId: 'A1',
      awayTeamId: 'B1',
      homeLabel: 'A1',
      awayLabel: 'B1',
      isPlayable: true,
    });

    const incomplete = snapshot(groups, [
      match(
        'a-match',
        1,
        { kind: 'TEAM', teamId: 'A1' },
        { kind: 'TEAM', teamId: 'A2' },
        { groupId: 'A' },
      ),
      finishedGroupMatch('b-match', 2, 'B', 'B1', 'B2', 15, 5),
      playoff,
    ]);
    const unresolved = resolveMatches(incomplete, createSeededRng('resolve-incomplete'));
    expect(unresolved[2]).toMatchObject({
      homeTeamId: null,
      awayTeamId: 'B1',
      homeLabel: '1° Grupo A',
      isPlayable: false,
    });
  });

  it('resolves cross-group positions after all relevant groups finish', () => {
    const groups = [group('A', ['A1', 'A2']), group('B', ['B1', 'B2'])];
    const positionMatch = match(
      'position-match',
      3,
      { kind: 'LEVEL_POSITION', level: 1, position: 1 },
      { kind: 'LEVEL_POSITION', level: 1, position: 2 },
      { stageId: 'playoffs' },
    );
    const complete = snapshot(groups, [
      finishedGroupMatch('a-match', 1, 'A', 'A1', 'A2', 20, 5),
      finishedGroupMatch('b-match', 2, 'B', 'B1', 'B2', 15, 5),
      positionMatch,
    ]);

    expect(resolveMatches(complete, createSeededRng('resolve-level'))[2]).toMatchObject({
      homeTeamId: 'A1',
      awayTeamId: 'B1',
      isPlayable: true,
    });

    const incomplete = snapshot(groups, [
      finishedGroupMatch('a-match', 1, 'A', 'A1', 'A2', 20, 5),
      match(
        'b-match',
        2,
        { kind: 'TEAM', teamId: 'B1' },
        { kind: 'TEAM', teamId: 'B2' },
        { groupId: 'B' },
      ),
      positionMatch,
    ]);
    expect(resolveMatches(incomplete, createSeededRng('resolve-level-pending'))[2]).toMatchObject({
      homeTeamId: null,
      awayTeamId: null,
      homeLabel: '1° del nivel 1',
      isPlayable: false,
    });
  });

  it('resolves winners and losers of finished matches, including sudden-death winners', () => {
    const groups = [group('A', ['A1', 'A2'])];
    const semifinal = match(
      'semifinal',
      14,
      { kind: 'TEAM', teamId: 'A1' },
      { kind: 'TEAM', teamId: 'A2' },
      {
        stageId: 'knockout',
        status: 'FINISHED',
        result: { ...result(15, 15, 'A2'), definition: 'SUDDEN_DEATH' },
      },
    );
    const final = match(
      'final',
      15,
      { kind: 'WINNER_OF', matchId: 'semifinal' },
      { kind: 'LOSER_OF', matchId: 'semifinal' },
      { stageId: 'knockout' },
    );
    const resolved = resolveMatches(
      snapshot(groups, [semifinal, final]),
      createSeededRng('winner'),
    );

    expect(resolved[1]).toMatchObject({
      homeTeamId: 'A2',
      awayTeamId: 'A1',
      homeLabel: 'A2',
      awayLabel: 'A1',
      isPlayable: true,
    });
  });

  it('leaves tied matches without a winner unresolved and labels the source match', () => {
    const tiedMatch = match(
      'tied',
      14,
      { kind: 'TEAM', teamId: 'A1' },
      { kind: 'TEAM', teamId: 'A2' },
      { stageId: 'knockout', status: 'FINISHED', result: result(10, 10) },
    );
    const nextMatch = match(
      'next',
      15,
      { kind: 'WINNER_OF', matchId: 'tied' },
      { kind: 'TEAM', teamId: 'A3' },
      { stageId: 'knockout' },
    );
    const resolved = resolveMatches(snapshot([], [tiedMatch, nextMatch]), createSeededRng('tied'));

    expect(resolved[1]).toMatchObject({
      homeTeamId: null,
      awayTeamId: 'A3',
      homeLabel: 'Ganador partido #14',
      isPlayable: false,
    });
  });

  it('automatically advances the opponent of a bye without making that match playable', () => {
    const byeMatch = match(
      'bye',
      1,
      { kind: 'TEAM', teamId: 'A1' },
      { kind: 'BYE' },
      { stageId: 'knockout' },
    );
    const nextMatch = match(
      'next',
      2,
      { kind: 'WINNER_OF', matchId: 'bye' },
      { kind: 'TEAM', teamId: 'B1' },
      { stageId: 'knockout' },
    );
    const resolved = resolveMatches(snapshot([], [byeMatch, nextMatch]), createSeededRng('bye'));

    expect(resolved[0]).toMatchObject({
      homeTeamId: 'A1',
      awayTeamId: null,
      awayLabel: 'Libre',
      isPlayable: false,
    });
    expect(resolved[1]).toMatchObject({
      homeTeamId: 'A1',
      awayTeamId: 'B1',
      isPlayable: true,
    });
  });

  it('recomputes downstream teams from an edited source result', () => {
    const source = match(
      'source',
      1,
      { kind: 'TEAM', teamId: 'A1' },
      { kind: 'TEAM', teamId: 'A2' },
      { stageId: 'knockout', status: 'FINISHED', result: result(10, 5) },
    );
    const next = match(
      'next',
      2,
      { kind: 'WINNER_OF', matchId: 'source' },
      { kind: 'TEAM', teamId: 'B1' },
      { stageId: 'knockout' },
    );
    const before = snapshot([], [source, next]);
    const after = snapshot([], [{ ...source, result: result(5, 10) }, next]);

    expect(resolveMatches(before, createSeededRng('before-edit'))[1].homeTeamId).toBe('A1');
    expect(resolveMatches(after, createSeededRng('after-edit'))[1].homeTeamId).toBe('A2');
  });

  it('returns new group tiebreak draws for the caller to persist', () => {
    const groupA = group('A', ['A1', 'A2']);
    const groupB = group('B', ['B1', 'B2']);
    const snapshotWithTie = snapshot(
      [groupA, groupB],
      [
        finishedGroupMatch('a-match', 1, 'A', 'A1', 'A2', 0, 0),
        finishedGroupMatch('b-match', 2, 'B', 'B1', 'B2', 15, 5),
        match(
          'playoff',
          3,
          { kind: 'GROUP_POSITION', groupId: 'A', position: 1 },
          { kind: 'GROUP_POSITION', groupId: 'B', position: 1 },
          { stageId: 'playoffs' },
        ),
      ],
    );
    const generated = resolveMatchesWithDraws(snapshotWithTie, createSeededRng('group-tie'));

    expect(generated.newDraws).toHaveLength(1);
    expect(generated.newDraws[0].payload.kind).toBe('TIEBREAK');
    const persisted: TournamentSnapshot = {
      ...snapshotWithTie,
      draws: [...snapshotWithTie.draws, ...generated.newDraws],
    };
    const recomputed = resolveMatches(persisted, createSeededRng('different-seed'));
    expect(recomputed[2].homeTeamId).toBe(generated.matches[2].homeTeamId);
  });
});
