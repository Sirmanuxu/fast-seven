import { FormatParams, GenerateFixture } from './model';
import { generateKnockoutFixtureContract } from './knockout';
import { generateRoundRobinFixtureContract } from './round-robin';
import { generateGroupsKnockoutFixtureContract } from './groups-knockout';
import { generateGroupsCupsFixtureContract } from './groups-cups';
import { generateGroupsPositionPlayoffsFixtureContract } from './groups-position-playoffs';
import { generateSwissFixtureContract } from './swiss';
import { generateDoubleEliminationFixtureContract } from './double-elimination';

export const generateFixture: GenerateFixture = (input) => {
  const params: FormatParams = input.params;
  if (params.format === 'ROUND_ROBIN') {
    return generateRoundRobinFixtureContract(input);
  }
  if (params.format === 'KNOCKOUT') {
    return generateKnockoutFixtureContract(input);
  }
  if (params.format === 'GROUPS_KNOCKOUT') {
    return generateGroupsKnockoutFixtureContract(input);
  }
  if (params.format === 'GROUPS_CUPS') {
    return generateGroupsCupsFixtureContract(input);
  }
  if (params.format === 'GROUPS_POSITION_PLAYOFFS') {
    return generateGroupsPositionPlayoffsFixtureContract(input);
  }
  if (params.format === 'SWISS') {
    return generateSwissFixtureContract(input);
  }
  if (params.format === 'DOUBLE_ELIMINATION') {
    return generateDoubleEliminationFixtureContract(input);
  }
  return {
    ok: false,
    error: {
      code: 'unsupportedFormat',
      messageKey: 'fixture.unsupportedFormat',
      params: { format: params.format },
    },
  };
};
