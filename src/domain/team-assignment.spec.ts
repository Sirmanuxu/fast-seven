import { describe, expect, it } from 'vitest';
import { Player, Team } from './model';
import { analyzePlayerAssignments, getTeamRosterStatus } from './team-assignment';

const player = (id: string, teamId: string | null): Player => ({
  id,
  firstName: 'Juan',
  lastName: id,
  category: 'M16',
  gender: 'M',
  teamId,
  disambiguation: null,
  normalizedKey: id,
});

const team = (id: string, captainId: string | null): Team => ({
  id,
  name: id,
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
  captainId,
  logo: null,
  isSeed: false,
  status: 'ACTIVE',
});

describe('team assignment', () => {
  it('reports teams whose selected captain will be moved', () => {
    const players = [player('captain', 'team-a')];
    const teams = [team('team-a', 'captain')];

    expect(
      analyzePlayerAssignments(players, ['captain'], 'team-b', teams).captainClearedTeamIds,
    ).toEqual(['team-a']);
  });

  it('does not clear the captain for a non-captain move', () => {
    const players = [player('player', 'team-a')];
    const result = analyzePlayerAssignments(players, ['player'], null, [team('team-a', 'captain')]);
    expect(result.captainClearedTeamIds).toEqual([]);
  });

  it('computes roster states', () => {
    const players = [player('1', 'team-a'), player('2', 'team-a')];
    expect(getTeamRosterStatus(players, 'team-a', { min: 7, max: 12 }).state).toBe('BELOW_MINIMUM');
  });
});
