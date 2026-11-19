import { describe, expect, it } from 'vitest';
import { Player, Team } from './model';
import {
  areTeamColorsTooSimilar,
  canCreateOrDeleteTeam,
  getRosterStatus,
  hasMixedRoster,
  normalizeTeamName,
  validateTeamInput,
} from './team';

const player = (
  id: string,
  teamId: string | null,
  category = 'M16',
  gender: 'M' | 'F' = 'M',
): Player => ({
  id,
  firstName: 'Juan',
  lastName: id,
  category,
  gender,
  teamId,
  disambiguation: null,
  normalizedKey: id,
});

describe('team rules', () => {
  it('normalizes accents, case and spaces for unique names', () => {
    expect(normalizeTeamName('  Los   Terós  ')).toBe('los teros');
  });

  it('detects duplicate normalized names', () => {
    const team: Team = {
      id: 'team-1',
      name: 'Los Teros',
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      captainId: null,
      logo: null,
      isSeed: false,
      status: 'ACTIVE',
    };

    const result = validateTeamInput({
      name: ' los terós ',
      primaryColor: '#000000',
      secondaryColor: '#ffffff',
      captainId: null,
      teamId: null,
      players: [],
      teams: [team],
    });

    expect(result.ok).toBe(false);
  });

  it('calculates roster warning states', () => {
    const players = [player('1', 'team-1'), player('2', 'team-1')];

    expect(getRosterStatus(players, 'team-1', { min: 7, max: 12 }).label).toBe('rojo');
    expect(
      getRosterStatus(
        [...players, ...Array.from({ length: 12 }, (_, index) => player(`${index}`, 'team-1'))],
        'team-1',
        {
          min: 7,
          max: 12,
        },
      ).label,
    ).toBe('amarillo');
  });

  it('detects mixed category or gender rosters', () => {
    expect(
      hasMixedRoster(
        [player('1', 'team-1', 'M16', 'M'), player('2', 'team-1', 'M19', 'F')],
        'team-1',
      ),
    ).toBe(true);
  });

  it('warns for similar colors and allows setup fixture changes', () => {
    expect(areTeamColorsTooSimilar('#ffffff', '#fefefe')).toBe(true);
    expect(canCreateOrDeleteTeam('SETUP')).toBe(true);
    expect(canCreateOrDeleteTeam('FIXTURE_GENERATED')).toBe(true);
    expect(canCreateOrDeleteTeam('RUNNING')).toBe(false);
  });
});
