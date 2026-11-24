import { expect, it } from 'vitest';
import { generateFixture, generateRoundRobinFixture, generateRoundRobinMatches } from './round-robin';
import { Team } from './model';

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

function refTeamId(match: { readonly home: unknown; readonly away: unknown }, side: 'home' | 'away') {
  const ref = match[side] as { readonly kind: string; readonly teamId?: string };
  return ref.kind === 'TEAM' ? ref.teamId : undefined;
}

for (const teamCount of [3, 4, 5, 6, 8]) {
  for (const rounds of [1, 2] as const) {
    it(`generates n=${teamCount}, v=${rounds} with every pair exactly once per lap`, () => {
      const teamIds = Array.from({ length: teamCount }, (_, index) => `T${index + 1}`);
      const result = generateRoundRobinMatches({
        teamIds,
        rounds,
        stageId: 'stage',
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) {
        return;
      }
      const matches = result.value;
      expect(matches).toHaveLength((rounds * teamCount * (teamCount - 1)) / 2);

      const pairCounts = new Map<string, number>();
      for (const match of matches) {
        const home = refTeamId(match, 'home');
        const away = refTeamId(match, 'away');
        expect(home).not.toBe(away);
        if (home && away) {
          const pair = [home, away].sort().join('|');
          pairCounts.set(pair, (pairCounts.get(pair) ?? 0) + 1);
        }
      }
      for (const teamId of teamIds) {
        for (const opponentId of teamIds) {
          if (teamId !== opponentId) {
            const pair = [teamId, opponentId].sort().join('|');
            expect(pairCounts.get(pair)).toBe(rounds);
          }
        }
      }

      const homeAwayDifference = new Map(teamIds.map((teamId) => [teamId, 0]));
      for (const match of matches) {
        const home = refTeamId(match, 'home');
        const away = refTeamId(match, 'away');
        if (home) {
          homeAwayDifference.set(home, (homeAwayDifference.get(home) ?? 0) + 1);
        }
        if (away) {
          homeAwayDifference.set(away, (homeAwayDifference.get(away) ?? 0) - 1);
        }
      }
      for (const difference of homeAwayDifference.values()) {
        expect(Math.abs(difference)).toBeLessThanOrEqual(1);
      }

      for (const round of new Set(matches.map((match) => match.round))) {
        const roundTeamIds = matches
          .filter((match) => match.round === round)
          .flatMap((match) => [
            refTeamId(match, 'home'),
            refTeamId(match, 'away'),
          ])
          .filter((id): id is string => id !== undefined);
        expect(new Set(roundTeamIds).size).toBe(roundTeamIds.length);
      }
    });
  }
}

it('shows a bye as an omitted match for an odd team count', () => {
  const result = generateRoundRobinFixture({
    teamIds: ['A', 'B', 'C'],
    rounds: 1,
    stageId: 'league',
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.matches).toHaveLength(3);
    expect(result.value.stage.type).toBe('LEAGUE');
  }
});

it('does not mutate team order and generates persistent match references', () => {
  const teamIds = ['B', 'A', 'C', 'D'];
  const result = generateRoundRobinFixture({
    teamIds,
    rounds: 1,
    stageId: 'league',
  });

  expect(teamIds).toEqual(['B', 'A', 'C', 'D']);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.matches.every((match) => match.isPhantom === false)).toBe(true);
  }
});

it('implements the model fixture contract for round robin', () => {
  const result = generateFixture({
    teams: ['A', 'B', 'C'].map(team),
    params: { format: 'ROUND_ROBIN', rounds: 2 },
    draws: [],
    rng: {
      next: () => 0,
      nextInt: () => 0,
      shuffle: (items) => [...items],
    },
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.matches).toHaveLength(6);
    expect(result.value.stages).toHaveLength(1);
  }
});
