import { describe, expect, it } from 'vitest';
import { createFixedClock } from './clock';
import { computeStandings } from './standings';
import { finishPendingWithdrawalWalkovers, reinstateTeam, withdrawTeam } from './team-withdrawal';
import { Match, ResolvedMatch, Team, TournamentSnapshot } from './model';

const changedAt = '2026-11-27T03:00:00.000Z';

function team(id: string, status: Team['status'] = 'ACTIVE'): Team {
  return {
    id,
    name: id,
    primaryColor: '#112233',
    secondaryColor: '#445566',
    captainId: null,
    logo: null,
    isSeed: false,
    status,
  };
}

function match(
  id: string,
  homeTeamId: string,
  awayTeamId: string,
  status: Match['status'] = 'PENDING',
): Match {
  return {
    id,
    stageId: 'stage',
    groupId: 'group',
    round: 1,
    order: 1,
    label: null,
    home: { kind: 'TEAM', teamId: homeTeamId },
    away: { kind: 'TEAM', teamId: awayTeamId },
    status,
    result:
      status === 'FINISHED'
        ? {
            mode: 'DIRECT',
            homePoints: 10,
            awayPoints: 5,
            definition: 'REGULAR',
            winnerTeamId: homeTeamId,
          }
        : null,
    startedAt: status === 'IN_PROGRESS' ? changedAt : null,
    finishedAt: status === 'FINISHED' ? changedAt : null,
    isPhantom: false,
    isConditional: false,
  };
}

function resolved(
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  isPlayable = true,
): ResolvedMatch {
  return {
    matchId,
    homeTeamId,
    awayTeamId,
    homeLabel: homeTeamId,
    awayLabel: awayTeamId,
    isPlayable,
  };
}

function snapshot(
  teams: readonly Team[],
  matches: readonly Match[],
  tournamentStatus: TournamentSnapshot['tournament']['status'] = 'RUNNING',
): TournamentSnapshot {
  return {
    tournament: {
      id: 'tournament',
      name: 'Tournament',
      date: changedAt,
      status: tournamentStatus,
      formatParams: { format: 'ROUND_ROBIN', rounds: 1 },
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
      schedule: { startTime: null, matchDurationMin: 20, restMin: 5, breaks: [] },
      categories: [],
      backupIntervalMin: 10,
      schemaVersion: 1,
      createdAt: changedAt,
      updatedAt: changedAt,
    },
    players: [],
    teams,
    stages: [],
    groups: [],
    matches,
    events: [],
    draws: [],
  };
}

describe('team withdrawal', () => {
  it('matches the HU-40 reference case and keeps completed matches unchanged', () => {
    const matches = [
      match('against-x', 'X', 'T'),
      match('against-y', 'Y', 'T'),
      match('finished-against-z', 'Z', 'T', 'FINISHED'),
    ];
    const base = snapshot([team('T'), team('X'), team('Y'), team('Z')], matches);
    const resolvedMatches = [
      resolved('against-x', 'X', 'T'),
      resolved('against-y', 'Y', 'T'),
      resolved('finished-against-z', 'T', 'Z'),
    ];

    const result = withdrawTeam(
      base,
      resolvedMatches,
      'T',
      createFixedClock(Date.parse(changedAt)),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        team: { id: 'T', status: 'WITHDRAWN' },
        matches: [
          {
            id: 'against-x',
            status: 'FINISHED',
            result: {
              mode: 'WALKOVER',
              homePoints: 28,
              awayPoints: 0,
              winnerTeamId: 'X',
              walkoverOrigin: { kind: 'TEAM_WITHDRAWAL', teamId: 'T' },
            },
          },
          {
            id: 'against-y',
            status: 'FINISHED',
            result: {
              mode: 'WALKOVER',
              homePoints: 28,
              awayPoints: 0,
              winnerTeamId: 'Y',
              walkoverOrigin: { kind: 'TEAM_WITHDRAWAL', teamId: 'T' },
            },
          },
        ],
        affectedMatchIds: ['against-x', 'against-y'],
      },
    });
    expect(result.ok && result.value.matches).not.toContain(matches[2]);
    expect(matches[0].status).toBe('PENDING');

    if (!result.ok) throw new Error('Expected team withdrawal to succeed');
    const standings = computeStandings({
      teamIds: ['T', 'X', 'Y', 'Z'],
      teams: [result.value.team, ...base.teams.filter((candidate) => candidate.id !== 'T')],
      matches: [...result.value.matches, matches[2]],
      events: [],
      rules: base.tournament.rules,
      draws: [],
      rng: {
        next: () => 0,
        nextInt: () => 0,
        shuffle: (items) => [...items],
      },
    });
    expect(standings.rows.find((row) => row.teamId === 'T')).toMatchObject({
      withdrawn: true,
      lost: 3,
      tablePoints: 1,
    });
  });

  it('leaves a pending match between two withdrawn teams for manual resolution', () => {
    const pending = match('double-wo', 'T', 'X');
    const base = snapshot([team('T'), team('X', 'WITHDRAWN')], [pending]);

    const result = withdrawTeam(
      base,
      [resolved('double-wo', 'T', 'X')],
      'T',
      createFixedClock(Date.parse(changedAt)),
    );

    expect(result).toMatchObject({
      ok: true,
      value: { team: { status: 'WITHDRAWN' }, matches: [], affectedMatchIds: [] },
    });
    expect(pending.status).toBe('PENDING');
  });

  it('finishes a newly resolved pending match against a withdrawn team', () => {
    const pending = match('later-round', 'T', 'X');
    const base = snapshot([team('T', 'WITHDRAWN'), team('X')], [pending]);

    const result = finishPendingWithdrawalWalkovers(
      base,
      [resolved('later-round', 'T', 'X')],
      createFixedClock(Date.parse(changedAt)),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        affectedMatchIds: ['later-round'],
        matches: [
          {
            id: 'later-round',
            result: {
              mode: 'WALKOVER',
              winnerTeamId: 'X',
              walkoverOrigin: { kind: 'TEAM_WITHDRAWAL', teamId: 'T' },
            },
          },
        ],
      },
    });
  });

  it('requires an in-progress match to be resolved before withdrawal', () => {
    const live = match('live', 'T', 'X', 'IN_PROGRESS');
    const base = snapshot([team('T'), team('X')], [live]);

    const result = withdrawTeam(
      base,
      [resolved('live', 'T', 'X')],
      'T',
      createFixedClock(Date.parse(changedAt)),
    );

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'teamHasInProgressMatch' },
    });
    expect(live.status).toBe('IN_PROGRESS');
  });

  it('reinstates only walkovers generated by this team withdrawal', () => {
    const generated = {
      ...match('generated', 'T', 'X', 'FINISHED'),
      result: {
        mode: 'WALKOVER' as const,
        homePoints: 28,
        awayPoints: 0,
        definition: 'WALKOVER' as const,
        winnerTeamId: 'T',
        walkoverOrigin: { kind: 'TEAM_WITHDRAWAL' as const, teamId: 'T' },
      },
    };
    const manual = {
      ...match('manual', 'T', 'Y', 'FINISHED'),
      result: {
        mode: 'WALKOVER' as const,
        homePoints: 28,
        awayPoints: 0,
        definition: 'WALKOVER' as const,
        winnerTeamId: 'T',
      },
    };
    const base = snapshot([team('T', 'WITHDRAWN'), team('X'), team('Y')], [generated, manual]);

    const result = reinstateTeam(base, 'T');

    expect(result).toMatchObject({
      ok: true,
      value: {
        team: { status: 'ACTIVE' },
        matches: [{ id: 'generated', status: 'PENDING', result: null, startedAt: null }],
        affectedMatchIds: ['generated'],
      },
    });
    expect(manual.status).toBe('FINISHED');
  });
});
