import { describe, expect, it } from 'vitest';
import {
  computeFormatOption,
  computeFormatOptions,
  getGroupCountAlternatives,
  getGroupSizes,
  validateFormatParams,
} from './format-options';
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
      maxMatchesPerTeam: 7,
      estimatedDurationMin: 1400,
    });
    expect(option(12, 'ROUND_ROBIN')).toMatchObject({
      totalMatches: 66,
      minMatchesPerTeam: 11,
      maxMatchesPerTeam: 11,
    });
  });

  it('calculates group knockout totals, uneven groups and byes', () => {
    expect(option(8, 'GROUPS_KNOCKOUT')).toMatchObject({
      totalMatches: 15,
      minMatchesPerTeam: 3,
      maxMatchesPerTeam: 5,
    });
    expect(option(11, 'GROUPS_KNOCKOUT')).toMatchObject({
      totalMatches: 20,
      minMatchesPerTeam: 2,
      maxMatchesPerTeam: 6,
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
    expect(option(5, 'ROUND_ROBIN')).toMatchObject({
      totalMatches: 10,
      minMatchesPerTeam: 4,
      maxMatchesPerTeam: 4,
    });
    expect(option(12, 'GROUPS_CUPS')).toMatchObject({
      totalMatches: 26,
      minMatchesPerTeam: 4,
      maxMatchesPerTeam: 5,
    });
    expect(option(8, 'KNOCKOUT')).toMatchObject({
      totalMatches: 7,
      minMatchesPerTeam: 1,
      maxMatchesPerTeam: 3,
    });
    expect(option(5, 'KNOCKOUT')).toMatchObject({
      totalMatches: 4,
      minMatchesPerTeam: 1,
      maxMatchesPerTeam: 3,
    });
    expect(option(8, 'GROUPS_POSITION_PLAYOFFS')).toMatchObject({
      totalMatches: 16,
      minMatchesPerTeam: 4,
      maxMatchesPerTeam: 5,
    });
    expect(option(8, 'SWISS')).toMatchObject({
      totalMatches: 12,
      minMatchesPerTeam: 3,
      maxMatchesPerTeam: 3,
    });
    expect(option(9, 'SWISS')).toMatchObject({
      totalMatches: 16,
      minMatchesPerTeam: 3,
      maxMatchesPerTeam: 4,
    });
    expect(option(4, 'DOUBLE_ELIMINATION')).toMatchObject({
      totalMatches: 6,
      minMatchesPerTeam: 2,
      maxMatchesPerTeam: 4,
    });
    expect(option(5, 'DOUBLE_ELIMINATION')).toMatchObject({
      totalMatches: 8,
      minMatchesPerTeam: 2,
      maxMatchesPerTeam: 6,
    });
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

describe('format parameter validation', () => {
  it('suggests 4-4-3 and offers 6-5 alternatives for 11 teams', () => {
    expect(getGroupSizes(11, 3)).toEqual([4, 4, 3]);
    expect(getGroupSizes(11, 2)).toEqual([6, 5]);
    expect(getGroupCountAlternatives(11).slice(0, 2)).toEqual([3, 2]);
  });

  it('blocks fewer than 2 teams', () => {
    expect(
      validateFormatParams(1, { format: 'ROUND_ROBIN', rounds: 1 }).map((error) => error.code),
    ).toContain('TEAM_COUNT_TOO_LOW');
  });

  it('blocks too many groups and zero or excessive qualifiers', () => {
    expect(
      validateFormatParams(8, {
        format: 'GROUPS_KNOCKOUT',
        groupCount: 5,
        qualifiersPerGroup: 1,
        thirdPlaceMatch: false,
      }).map((error) => error.code),
    ).toContain('TOO_MANY_GROUPS');

    expect(
      validateFormatParams(8, {
        format: 'GROUPS_KNOCKOUT',
        groupCount: 2,
        qualifiersPerGroup: 0,
        thirdPlaceMatch: false,
      }).map((error) => error.code),
    ).toContain('QUALIFIERS_ZERO');

    expect(
      validateFormatParams(11, {
        format: 'GROUPS_KNOCKOUT',
        groupCount: 3,
        qualifiersPerGroup: 4,
        thirdPlaceMatch: false,
      }).map((error) => error.code),
    ).toContain('QUALIFIERS_TOO_HIGH');
  });

  it('limits swiss rounds and warns about too few rounds', () => {
    expect(
      validateFormatParams(8, { format: 'SWISS', rounds: 8 }).map((error) => error.code),
    ).toContain('SWISS_ROUNDS_OUT_OF_RANGE');
    expect(validateFormatParams(8, { format: 'SWISS', rounds: 1 })).toEqual([]);

    expect(
      computeFormatOption(8, schedule, { format: 'SWISS', rounds: 2 }).warnings,
    ).toContainEqual({ code: 'FEW_SWISS_ROUNDS', messageKey: 'format.fewSwissRounds' });
  });

  it('reports the knockout bracket size and bye count for non-powers of two', () => {
    expect(
      computeFormatOption(11, schedule, { format: 'KNOCKOUT', thirdPlaceMatch: false }).warnings,
    ).toContainEqual({
      code: 'KNOCKOUT_BYES',
      messageKey: 'format.knockoutByes',
      params: { count: 5 },
    });
  });

  it('recalculates totals after parameter changes', () => {
    expect(
      computeFormatOption(11, schedule, {
        format: 'GROUPS_KNOCKOUT',
        groupCount: 3,
        qualifiersPerGroup: 2,
        thirdPlaceMatch: false,
      }),
    ).toMatchObject({
      totalMatches: 20,
      minMatchesPerTeam: 2,
      estimatedDurationMin: 1000,
      viable: true,
    });
  });
});
