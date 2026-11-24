import { describe, expect, it } from 'vitest';
import { computeFormatOptions } from './format-options';
import { ScheduleConfig } from './model';

const schedule: ScheduleConfig = { startTime: null, matchDurationMin: 40, restMin: 10, breaks: [] };
const option = (teamCount: number, format: string) =>
  computeFormatOptions(teamCount, schedule).find((candidate) => candidate.format === format);

describe('computeFormatOptions', () => {
  it('calculates round-robin reference totals and duration', () => {
    expect(option(8, 'ROUND_ROBIN')).toMatchObject({
      viable: true,
      totalMatches: 28,
      minMatchesPerTeam: 7,
      estimatedDurationMin: 1400,
    });
    expect(option(12, 'ROUND_ROBIN')).toMatchObject({ totalMatches: 66, minMatchesPerTeam: 11 });
  });

  it('calculates group knockout totals, uneven groups and byes', () => {
    expect(option(8, 'GROUPS_KNOCKOUT')).toMatchObject({
      totalMatches: 15,
      minMatchesPerTeam: 3,
    });
    expect(option(11, 'GROUPS_KNOCKOUT')).toMatchObject({
      totalMatches: 20,
      minMatchesPerTeam: 2,
      warnings: expect.arrayContaining([
        { code: 'UNEVEN_GROUPS', messageKey: 'format.unevenGroups' },
        { code: 'KNOCKOUT_BYES', messageKey: 'format.knockoutByes', params: { count: 2 } },
      ]),
    });
    expect(option(8, 'GROUPS_KNOCKOUT')?.suggestedParams).toEqual({
      format: 'GROUPS_KNOCKOUT',
      groupCount: 2,
      qualifiersPerGroup: 2,
      thirdPlaceMatch: false,
    });
  });

  it('calculates the other reference totals', () => {
    expect(option(5, 'ROUND_ROBIN')).toMatchObject({ totalMatches: 10, minMatchesPerTeam: 4 });
    expect(option(12, 'GROUPS_CUPS')).toMatchObject({ totalMatches: 26, minMatchesPerTeam: 4 });
    expect(option(8, 'KNOCKOUT')).toMatchObject({ totalMatches: 7, minMatchesPerTeam: 1 });
    expect(option(5, 'KNOCKOUT')).toMatchObject({ totalMatches: 4, minMatchesPerTeam: 1 });
    expect(option(8, 'GROUPS_POSITION_PLAYOFFS')).toMatchObject({ totalMatches: 16, minMatchesPerTeam: 4 });
    expect(option(8, 'SWISS')).toMatchObject({ totalMatches: 12, minMatchesPerTeam: 3 });
    expect(option(9, 'SWISS')).toMatchObject({ totalMatches: 16, minMatchesPerTeam: 3 });
    expect(option(4, 'DOUBLE_ELIMINATION')).toMatchObject({ totalMatches: 6, minMatchesPerTeam: 2 });
    expect(option(5, 'DOUBLE_ELIMINATION')).toMatchObject({ totalMatches: 8, minMatchesPerTeam: 2 });
  });

  it('disables formats that cannot support the team count', () => {
    expect(option(3, 'SWISS')).toMatchObject({
      viable: false,
      notViableReasonKey: 'format.swissNeedsFourTeams',
      suggestedParams: null,
    });
    expect(option(2, 'GROUPS_CUPS')).toMatchObject({
      viable: false,
      notViableReasonKey: 'format.groupsNeedsFourTeams',
    });
    expect(computeFormatOptions(1, schedule).every((candidate) => !candidate.viable)).toBe(true);
  });

  it('uses the configured match and rest duration', () => {
    expect(option(8, 'KNOCKOUT')?.estimatedDurationMin).toBe(350);
  });
});
