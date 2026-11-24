import { ComputeFormatOptions, FormatId, FormatOption, FormatParams, Warning } from './model';

const FORMAT_IDS: readonly FormatId[] = [
  'ROUND_ROBIN',
  'GROUPS_KNOCKOUT',
  'GROUPS_CUPS',
  'KNOCKOUT',
  'GROUPS_POSITION_PLAYOFFS',
  'SWISS',
  'DOUBLE_ELIMINATION',
];

const nextPowerOfTwo = (value: number): number => {
  let result = 1;
  while (result < value) result *= 2;
  return result;
};

const groupSizes = (teamCount: number, groupCount: number): readonly number[] => {
  const baseSize = Math.floor(teamCount / groupCount);
  const largerGroupCount = teamCount % groupCount;
  return Array.from({ length: groupCount }, (_, index) =>
    baseSize + (index < largerGroupCount ? 1 : 0),
  );
};

const groupMatches = (sizes: readonly number[]): number =>
  sizes.reduce((total, size) => total + (size * (size - 1)) / 2, 0);

const warning = (code: string, messageKey: string, params?: Readonly<Record<string, string | number>>): Warning => ({
  code,
  messageKey,
  ...(params ? { params } : {}),
});

const invalidReason = (format: FormatId, teamCount: number): string | null => {
  if (teamCount < 2) return 'format.notEnoughTeams';
  if (format === 'SWISS' && teamCount < 4) return 'format.swissNeedsFourTeams';
  if (format === 'DOUBLE_ELIMINATION' && teamCount < 3) return 'format.doubleEliminationNeedsThreeTeams';
  if (
    (format === 'GROUPS_KNOCKOUT' ||
      format === 'GROUPS_CUPS' ||
      format === 'GROUPS_POSITION_PLAYOFFS') &&
    teamCount < 4
  ) {
    return 'format.groupsNeedsFourTeams';
  }
  return null;
};

const suggestedGroupCount = (teamCount: number): number => {
  if (teamCount < 6) return 2;
  return Math.min(4, Math.max(2, Math.round(teamCount / 4)));
};

const makeSuggestedParams = (format: FormatId, teamCount: number): FormatParams | null => {
  if (invalidReason(format, teamCount)) return null;
  switch (format) {
    case 'ROUND_ROBIN':
      return { format, rounds: 1 };
    case 'GROUPS_KNOCKOUT': {
      const groupCount = suggestedGroupCount(teamCount);
      return {
        format,
        groupCount,
        qualifiersPerGroup: Math.min(2, Math.floor(teamCount / groupCount)),
        thirdPlaceMatch: false,
      };
    }
    case 'GROUPS_CUPS':
      return { format, groupCount: suggestedGroupCount(teamCount), thirdPlaceMatch: false };
    case 'KNOCKOUT':
      return { format, thirdPlaceMatch: false };
    case 'GROUPS_POSITION_PLAYOFFS':
      return { format, groupCount: suggestedGroupCount(teamCount) };
    case 'SWISS':
      return { format, rounds: Math.max(1, Math.ceil(Math.log2(teamCount))) };
    case 'DOUBLE_ELIMINATION':
      return { format, grandFinalReset: false };
  }
};

const calculateTotals = (
  params: FormatParams,
  teamCount: number,
): { readonly totalMatches: number; readonly minMatchesPerTeam: number; readonly warnings: readonly Warning[] } => {
  switch (params.format) {
    case 'ROUND_ROBIN':
      return {
        totalMatches: (params.rounds * teamCount * (teamCount - 1)) / 2,
        minMatchesPerTeam: params.rounds * (teamCount - 1),
        warnings: [],
      };
    case 'KNOCKOUT': {
      const totalMatches = teamCount - 1 + (params.thirdPlaceMatch ? 1 : 0);
      return {
        totalMatches,
        minMatchesPerTeam: 1,
        warnings:
          teamCount !== nextPowerOfTwo(teamCount)
            ? [warning('KNOCKOUT_BYES', 'format.knockoutByes', { count: nextPowerOfTwo(teamCount) - teamCount })]
            : [],
      };
    }
    case 'GROUPS_KNOCKOUT': {
      const sizes = groupSizes(teamCount, params.groupCount);
      const qualified = params.groupCount * params.qualifiersPerGroup;
      const bracketSize = nextPowerOfTwo(qualified);
      const totalMatches =
        groupMatches(sizes) + qualified - 1 + (params.thirdPlaceMatch ? 1 : 0);
      const warnings: Warning[] = [];
      if (new Set(sizes).size > 1) warnings.push(warning('UNEVEN_GROUPS', 'format.unevenGroups'));
      if (bracketSize > qualified) {
        warnings.push(warning('KNOCKOUT_BYES', 'format.knockoutByes', { count: bracketSize - qualified }));
      }
      return {
        totalMatches,
        minMatchesPerTeam: Math.min(...sizes) - 1,
        warnings,
      };
    }
    case 'GROUPS_CUPS': {
      const sizes = groupSizes(teamCount, params.groupCount);
      const cupCount = Math.max(...sizes);
      const warnings: Warning[] = [];
      if (new Set(sizes).size > 1) warnings.push(warning('UNEVEN_GROUPS', 'format.unevenGroups'));
      return {
        totalMatches: groupMatches(sizes) + cupCount * (params.groupCount - 1) +
          (params.thirdPlaceMatch ? cupCount : 0),
        minMatchesPerTeam: Math.min(...sizes) - 1 + 1,
        warnings,
      };
    }
    case 'GROUPS_POSITION_PLAYOFFS': {
      const sizes = groupSizes(teamCount, params.groupCount);
      const playoffMatches = Math.max(...sizes) * (nextPowerOfTwo(params.groupCount) - 1);
      const warnings = new Set(sizes).size > 1 ? [warning('UNEVEN_GROUPS', 'format.unevenGroups')] : [];
      return {
        totalMatches: groupMatches(sizes) + playoffMatches,
        minMatchesPerTeam: Math.min(...sizes),
        warnings,
      };
    }
    case 'SWISS': {
      const minMatchesPerTeam = params.rounds - (teamCount % 2 === 1 ? 1 : 0);
      const warnings =
        params.rounds < Math.ceil(Math.log2(teamCount))
          ? [warning('FEW_SWISS_ROUNDS', 'format.fewSwissRounds')]
          : [];
      return {
        totalMatches: params.rounds * Math.floor(teamCount / 2),
        minMatchesPerTeam,
        warnings,
      };
    }
    case 'DOUBLE_ELIMINATION':
      return {
        totalMatches: 2 * teamCount - 2 + (params.grandFinalReset ? 1 : 0),
        minMatchesPerTeam: 2,
        warnings:
          teamCount !== nextPowerOfTwo(teamCount)
            ? [warning('DOUBLE_ELIMINATION_BYES', 'format.doubleEliminationByes', {
                count: nextPowerOfTwo(teamCount) - teamCount,
              })]
            : [],
      };
  }
};

export const computeFormatOptions: ComputeFormatOptions = (teamCount, schedule) =>
  FORMAT_IDS.map((format) => {
    const reason = invalidReason(format, teamCount);
    const suggestedParams = makeSuggestedParams(format, teamCount);
    const totals = suggestedParams
      ? calculateTotals(suggestedParams, teamCount)
      : { totalMatches: 0, minMatchesPerTeam: 0, warnings: [] };
    return {
      format,
      viable: reason === null,
      notViableReasonKey: reason,
      suggestedParams,
      totalMatches: totals.totalMatches,
      minMatchesPerTeam: totals.minMatchesPerTeam,
      estimatedDurationMin:
        totals.totalMatches * Math.max(0, schedule.matchDurationMin + schedule.restMin),
      warnings: totals.warnings,
    } satisfies FormatOption;
  });
