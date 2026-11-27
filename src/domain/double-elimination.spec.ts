import { describe, expect, it } from 'vitest';
import { generateDoubleEliminationFixture } from './double-elimination';
import { generateFixture } from './fixture';
import {
  Match,
  ResolvedMatch,
  Team,
} from './model';
import { computeDoubleEliminationLives, isDoubleEliminationResetNeeded } from './double-elimination';
import { createSeededRng } from './rng';

function teams(count: number): readonly Team[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `T${index + 1}`,
    name: `T${index + 1}`,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed: true,
    status: 'ACTIVE',
  }));
}

describe('double-elimination fixture', () => {
  it('creates the reference 6-match structure for n = 4', () => {
    const fixture = generateDoubleEliminationFixture({
      teams: teams(4),
      grandFinalReset: false,
      rng: createSeededRng('double-4'),
    });
    expect(fixture.ok).toBe(true);
    if (!fixture.ok) return;

    expect(fixture.value.matches).toHaveLength(6);
    expect(fixture.value.matches.filter((match) => match.stageId === 'double-winners')).toHaveLength(3);
    expect(fixture.value.matches.filter((match) => match.stageId === 'double-losers')).toHaveLength(2);
    expect(fixture.value.matches.filter((match) => match.stageId === 'double-grand-final')).toHaveLength(1);
  });

  it('creates 14 matches for n = 8 and 15 with the reset', () => {
    for (const reset of [false, true]) {
      const fixture = generateDoubleEliminationFixture({
        teams: teams(8),
        grandFinalReset: reset,
        rng: createSeededRng(`double-8-${reset}`),
      });
      expect(fixture.ok).toBe(true);
      if (!fixture.ok) continue;
      expect(fixture.value.matches.filter((match) => !match.isPhantom)).toHaveLength(
        reset ? 15 : 14,
      );
      expect(
        fixture.value.matches.filter((match) => match.stageId === 'double-winners'),
      ).toHaveLength(7);
      expect(
        fixture.value.matches.filter((match) => match.stageId === 'double-losers'),
      ).toHaveLength(reset ? 6 : 6);
    }
  });

  it('marks the grand-final reset as conditional', () => {
    const fixture = generateDoubleEliminationFixture({
      teams: teams(4),
      grandFinalReset: true,
      rng: createSeededRng('double-reset'),
    });
    expect(fixture.ok).toBe(true);
    if (!fixture.ok) return;
    expect(fixture.value.matches).toHaveLength(7);
    expect(fixture.value.matches.at(-1)).toMatchObject({
      round: 2,
      label: 'Final con reinicio',
      isConditional: true,
    });
  });

  it.each([5, 6, 7, 9, 12])(
    'creates 2n-2 real matches and phantom byes for n = %i',
    (count) => {
      const fixture = generateDoubleEliminationFixture({
        teams: teams(count),
        grandFinalReset: false,
        rng: createSeededRng(`double-byes-${count}`),
      });
      expect(fixture.ok).toBe(true);
      if (!fixture.ok) return;
      expect(
        fixture.value.matches.filter((match) => !match.isPhantom && !match.isConditional),
      ).toHaveLength(2 * count - 2);
      expect(
        fixture.value.matches.filter(
          (match) =>
            match.isPhantom &&
            match.stageId === 'double-winners' &&
            match.away.kind === 'BYE',
        ),
      ).toHaveLength(2 ** Math.ceil(Math.log2(count)) - count);
    },
  );

  it('persists a bracket draw through the public fixture contract', () => {
    const fixture = generateFixture({
      teams: teams(4),
      params: { format: 'DOUBLE_ELIMINATION', grandFinalReset: false },
      draws: [],
      rng: createSeededRng('double-contract'),
    });
    expect(fixture.ok).toBe(true);
    if (!fixture.ok) return;
    expect(fixture.value.stages.map((stage) => stage.type)).toEqual([
      'WINNERS_BRACKET',
      'LOSERS_BRACKET',
      'GRAND_FINAL',
    ]);
    expect(fixture.value.newDraws).toHaveLength(1);
  });

  it('derives each team’s remaining lives and two-loss elimination', () => {
    const match = (
      id: string,
      homeTeamId: string,
      awayTeamId: string,
      homePoints: number,
      awayPoints: number,
    ): Match => ({
      id,
      stageId: 'double-winners',
      groupId: null,
      round: 1,
      order: 1,
      label: null,
      home: { kind: 'TEAM', teamId: homeTeamId },
      away: { kind: 'TEAM', teamId: awayTeamId },
      status: 'FINISHED',
      result: {
        mode: 'DIRECT',
        homePoints,
        awayPoints,
        definition: 'REGULAR',
        winnerTeamId: null,
      },
      startedAt: null,
      finishedAt: '2026-11-27T12:00:00.000Z',
      isPhantom: false,
      isConditional: false,
    });
    const matches = [
      match('w1', 'T1', 'T4', 21, 0),
      match('w2', 'T2', 'T3', 21, 0),
    ];
    const resolved: readonly ResolvedMatch[] = matches.map((entry) => ({
      matchId: entry.id,
      homeTeamId: entry.home.kind === 'TEAM' ? entry.home.teamId : null,
      awayTeamId: entry.away.kind === 'TEAM' ? entry.away.teamId : null,
      homeLabel: '',
      awayLabel: '',
      isPlayable: true,
    }));
    const lives = computeDoubleEliminationLives(
      ['T1', 'T2', 'T3', 'T4'],
      matches,
      resolved,
    );
    expect(lives).toContainEqual({ teamId: 'T3', losses: 1, livesRemaining: 1 });
    expect(lives).toContainEqual({ teamId: 'T4', losses: 1, livesRemaining: 1 });
  });

  it('requires the reset only when the losers-bracket champion wins the grand final', () => {
    const grandFinal: Match = {
      id: 'gf',
      stageId: 'double-grand-final',
      groupId: null,
      round: 1,
      order: 1,
      label: 'Gran final',
      home: { kind: 'TEAM', teamId: 'T1' },
      away: { kind: 'TEAM', teamId: 'T2' },
      status: 'FINISHED',
      result: {
        mode: 'DIRECT',
        homePoints: 10,
        awayPoints: 14,
        definition: 'REGULAR',
        winnerTeamId: null,
      },
      startedAt: null,
      finishedAt: '2026-11-27T12:00:00.000Z',
      isPhantom: false,
      isConditional: false,
    };
    const reset: Match = {
      ...grandFinal,
      id: 'gfr',
      round: 2,
      isConditional: true,
      status: 'PENDING',
      result: null,
    };
    const resolved: readonly ResolvedMatch[] = [
      {
        matchId: 'gf',
        homeTeamId: 'T1',
        awayTeamId: 'T2',
        homeLabel: 'T1',
        awayLabel: 'T2',
        isPlayable: true,
      },
    ];
    expect(isDoubleEliminationResetNeeded([grandFinal, reset], resolved)).toBe(true);
    expect(
      isDoubleEliminationResetNeeded(
        [{ ...grandFinal, result: { ...grandFinal.result!, homePoints: 14, awayPoints: 10 } }, reset],
        resolved,
      ),
    ).toBe(false);
  });
});
