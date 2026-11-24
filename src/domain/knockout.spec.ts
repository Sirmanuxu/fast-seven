import { describe, expect, it } from 'vitest';
import {
  generateKnockoutFixture,
  generateKnockoutMatches,
  getKnockoutBracketSize,
  getStandardSeedOrder,
} from './knockout';
import { generateFixture } from './fixture';
import { createSeededRng } from './rng';
import { MatchRef, Team } from './model';

function team(id: string, isSeed = false): Team {
  return {
    id,
    name: id,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed,
    status: 'ACTIVE',
  };
}

function teamId(ref: MatchRef): string | undefined {
  return ref.kind === 'TEAM' ? ref.teamId : undefined;
}

describe('knockout bracket generation', () => {
  it('returns the standard 8-slot seed order', () => {
    expect(getStandardSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('keeps seeds 1 and 2 in opposite halves and the top 4 in separate quarters', () => {
    for (const bracketSize of [8, 16, 32]) {
      const order = getStandardSeedOrder(bracketSize);
      const slot = (seed: number) => order.indexOf(seed);
      expect(slot(1) < bracketSize / 2).toBe(true);
      expect(slot(2) >= bracketSize / 2).toBe(true);
      for (const [first, second] of [
        [1, 2],
        [1, 3],
        [1, 4],
        [2, 3],
        [2, 4],
        [3, 4],
      ]) {
        expect(Math.floor(slot(first) / (bracketSize / 4))).not.toBe(
          Math.floor(slot(second) / (bracketSize / 4)),
        );
      }
    }
  });

  for (const teamCount of [2, 3, 5, 6, 8, 13]) {
    it(`generates the expected bracket for n=${teamCount}`, () => {
      const teamIds = Array.from({ length: teamCount }, (_, index) => `T${index + 1}`);
      const result = generateKnockoutMatches({
        teamIds,
        stageId: 'knockout',
        thirdPlaceMatch: true,
        rng: createSeededRng(`knockout-${teamCount}`),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const bracketSize = getKnockoutBracketSize(teamCount);
      const realMatches = result.value.filter((match) => !match.isPhantom);
      const thirdPlaceCount = realMatches.filter((match) => match.label === 'Tercer puesto').length;
      expect(bracketSize).toBe({ 2: 2, 3: 4, 5: 8, 6: 8, 8: 8, 13: 16 }[teamCount]);
      expect(realMatches.length - thirdPlaceCount).toBe(teamCount - 1);
      expect(thirdPlaceCount).toBe(teamCount >= 4 ? 1 : 0);
    });
  }

  it('places the n=5 byes and builds the reference semifinal structure', () => {
    const teamIds = ['T1', 'T2', 'T3', 'T4', 'T5'];
    const result = generateKnockoutMatches({
      teamIds,
      stageId: 'knockout',
      thirdPlaceMatch: true,
      seededTeamIds: ['T1', 'T2', 'T3'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const firstRound = result.value.filter((match) => match.round === 1);
    expect(firstRound).toHaveLength(1);
    expect(teamId(firstRound[0].home)).toBe('T4');
    expect(teamId(firstRound[0].away)).toBe('T5');

    const semifinals = result.value.filter((match) => match.round === 2);
    expect(semifinals).toHaveLength(2);
    expect(semifinals[0].home).toEqual({ kind: 'TEAM', teamId: 'T1' });
    expect(semifinals[0].away).toEqual({ kind: 'WINNER_OF', matchId: firstRound[0].id });
    expect(semifinals[1].home).toEqual({ kind: 'TEAM', teamId: 'T2' });
    expect(semifinals[1].away).toEqual({ kind: 'TEAM', teamId: 'T3' });

    const final = result.value.find((match) => match.label === 'Final');
    expect(final).toBeDefined();
    expect(final?.home.kind).toBe('WINNER_OF');
    expect(final?.away.kind).toBe('WINNER_OF');
  });

  it('uses seed marks first and persists the reproducible bracket draw', () => {
    const teams = [
      team('A', true),
      team('B', false),
      team('C', true),
      team('D', false),
      team('E', false),
    ];
    const result = generateKnockoutFixture({
      teams,
      teamIds: teams.map((entry) => entry.id),
      stageId: 'knockout',
      thirdPlaceMatch: true,
      rng: createSeededRng('seeded-bracket'),
      seed: 'seeded-bracket',
      createdAt: '2026-11-24T20:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.teamOrder.slice(0, 2)).toEqual(['A', 'C']);
    expect(result.value.teamOrder).not.toContain('missing');
    expect(result.value.draw?.payload).toEqual({
      kind: 'BRACKET',
      stageId: 'knockout',
      teamOrder: result.value.teamOrder,
    });
  });

  it('reuses an existing bracket draw and does not create a replacement draw', () => {
    const teams = [team('A'), team('B'), team('C')];
    const existingDraw = {
      id: 'saved-bracket',
      seed: 'saved',
      createdAt: '2026-11-24T20:00:00.000Z',
      payload: {
        kind: 'BRACKET' as const,
        stageId: 'knockout-stage',
        teamOrder: ['C', 'A', 'B'],
      },
    };
    const result = generateFixture({
      teams,
      params: { format: 'KNOCKOUT', thirdPlaceMatch: false },
      draws: [existingDraw],
      rng: createSeededRng('unused'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.newDraws).toEqual([]);
    expect(result.value.matches).toHaveLength(2);
  });

  it('creates a saved bracket draw through the model fixture contract', () => {
    const teams = [team('A'), team('B'), team('C')];
    const result = generateFixture({
      teams,
      params: { format: 'KNOCKOUT', thirdPlaceMatch: false },
      draws: [],
      rng: createSeededRng('fixture-bracket'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stages).toHaveLength(1);
    expect(result.value.newDraws).toHaveLength(1);
    expect(result.value.newDraws[0].payload.kind).toBe('BRACKET');
  });

  it('rejects duplicate teams and fewer than two teams', () => {
    expect(generateKnockoutMatches({ teamIds: ['A'] }).ok).toBe(false);
    expect(generateKnockoutMatches({ teamIds: ['A', 'A'] }).ok).toBe(false);
  });

  it('keeps every team in exactly one first-column slot', () => {
    for (let teamCount = 2; teamCount <= 32; teamCount += 1) {
      const teamIds = Array.from({ length: teamCount }, (_, index) => `T${index + 1}`);
      const fixture = generateKnockoutFixture({
        teamIds,
        rng: createSeededRng(`properties-${teamCount}`),
      });
      expect(fixture.ok).toBe(true);
      if (!fixture.ok) continue;
      const bracketSize = getKnockoutBracketSize(teamCount);
      const seedOrder = getStandardSeedOrder(bracketSize);
      const firstColumnTeamIds = seedOrder
        .filter((seed) => seed <= teamCount)
        .map((seed) => fixture.value.teamOrder[seed - 1]);
      expect(firstColumnTeamIds).toHaveLength(teamCount);
      expect(new Set(firstColumnTeamIds).size).toBe(teamCount);
      expect([...firstColumnTeamIds].sort()).toEqual([...teamIds].sort());
    }
  });
});
