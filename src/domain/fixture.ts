import { FormatParams, GenerateFixture } from './model';
import { generateKnockoutFixtureContract } from './knockout';
import { generateRoundRobinFixtureContract } from './round-robin';

export const generateFixture: GenerateFixture = (input) => {
  const params: FormatParams = input.params;
  if (params.format === 'ROUND_ROBIN') {
    return generateRoundRobinFixtureContract(input);
  }
  if (params.format === 'KNOCKOUT') {
    return generateKnockoutFixtureContract(input);
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
