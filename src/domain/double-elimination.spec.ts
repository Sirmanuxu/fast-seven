import { describe, expect, it } from 'vitest';
import { generateDoubleEliminationFixture } from './double-elimination';
import { generateFixture } from './fixture';
import { Team } from './model';
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
});
