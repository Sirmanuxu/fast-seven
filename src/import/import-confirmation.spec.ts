import { describe, expect, it } from 'vitest';
import { Team } from '../domain/model';
import { buildConfirmationPlan, proposeTeamResolutions } from './import-confirmation';
import { ImportPreviewRow } from './import-preview';

function team(id: string, name: string): Team {
  return {
    id,
    name,
    primaryColor: '#1f4b99',
    secondaryColor: '#f1c40f',
    captainId: null,
    logo: null,
    isSeed: false,
    status: 'ACTIVE',
  };
}

function row(rowNumber: number, teamName: string): ImportPreviewRow {
  return {
    rowNumber,
    raw: {},
    firstName: 'Ana',
    lastName: 'Lopez',
    categoryRaw: 'M16',
    genderRaw: 'F',
    teamNameRaw: teamName,
    normalizedCategory: 'M16',
    normalizedGender: 'F',
    normalizedTeamName: teamName,
    status: 'OK',
    issues: [],
    discarded: false,
    duplicateInFile: false,
    differentPerson: false,
    duplicateExisting: false,
    teamIsNew: false,
    teamIsSimilar: false,
  };
}

describe('import team confirmation', () => {
  it('merges an exact normalized team name', () => {
    const resolutions = proposeTeamResolutions(
      [row(2, 'los teros ')],
      [team('team-1', 'Los Teros')],
      'SETUP',
    );
    expect(resolutions[0]).toMatchObject({
      incomingName: 'los teros ',
      existingTeamId: 'team-1',
      action: 'MERGE',
    });
  });

  it('proposes a merge for an edit distance of one', () => {
    const resolutions = proposeTeamResolutions(
      [row(2, 'Los Tero')],
      [team('team-1', 'Los Teros')],
      'SETUP',
    );
    expect(resolutions[0].action).toBe('MERGE');
  });

  it('proposes a merge for an edit distance of two', () => {
    const resolutions = proposeTeamResolutions(
      [row(2, 'Los Teos')],
      [team('team-1', 'Los Teros')],
      'SETUP',
    );
    expect(resolutions[0].action).toBe('MERGE');
  });

  it('does not merge trailing-letter or trailing-number variants', () => {
    expect(
      proposeTeamResolutions([row(2, 'M16 B')], [team('team-1', 'M16 A')], 'SETUP')[0].action,
    ).toBe('CREATE');
    expect(
      proposeTeamResolutions([row(2, 'Lomas 2')], [team('team-1', 'Lomas 1')], 'SETUP')[0].action,
    ).toBe('CREATE');
  });

  it('does not create a new team while running', () => {
    const resolutions = proposeTeamResolutions([row(2, 'Equipo nuevo')], [], 'RUNNING');
    expect(resolutions[0].action).toBe('CREATE');
  });

  it('defaults existing duplicates to skip', () => {
    const duplicate = { ...row(2, 'Los Teros'), duplicateExisting: true };
    const resolutions = proposeTeamResolutions([duplicate], [team('team-1', 'Los Teros')], 'SETUP');
    const plan = buildConfirmationPlan([duplicate], resolutions, { 'team-1': 2 }, 'SETUP', 7);
    expect(plan.duplicateActions[2]).toBe('SKIP');
    expect(plan.createdPlayerCount).toBe(0);
    expect(plan.skippedPlayerCount).toBe(1);
  });

  it('counts update-team and distinct duplicate actions correctly', () => {
    const existingDuplicate = { ...row(2, 'Los Teros'), duplicateExisting: true };
    const inFileDuplicate = { ...row(3, 'Los Teros'), duplicateInFile: true };
    const resolutions = proposeTeamResolutions(
      [existingDuplicate, inFileDuplicate],
      [team('team-1', 'Los Teros')],
      'SETUP',
    );

    const plan = buildConfirmationPlan(
      [existingDuplicate, inFileDuplicate],
      resolutions,
      { 'team-1': 2 },
      'SETUP',
      7,
      { 2: 'UPDATE_TEAM', 3: 'DISTINCT' },
    );

    expect(plan.createdPlayerCount).toBe(1);
    expect(plan.skippedPlayerCount).toBe(0);
  });

  it('includes new teams in the under-minimum preview', () => {
    const firstRow = row(2, 'Halcones');
    const secondRow = row(3, 'Halcones');
    const resolutions = proposeTeamResolutions([firstRow, secondRow], [], 'SETUP');
    const plan = buildConfirmationPlan([firstRow, secondRow], resolutions, {}, 'SETUP', 7);

    expect(plan.createdTeamCount).toBe(1);
    expect(plan.underMinimumTeamCount).toBe(1);
  });
});
