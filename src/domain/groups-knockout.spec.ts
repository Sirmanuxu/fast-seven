import { describe, expect, it } from 'vitest';
import { generateFixture } from './fixture';
import { generateGroupsKnockoutFixture } from './groups-knockout';
import { createSeededRng } from './rng';
import { Group, Team } from './model';

function teams(ids: readonly string[]): readonly Team[] {
  return ids.map((id) => ({
    id,
    name: id,
    primaryColor: '#000000',
    secondaryColor: '#ffffff',
    captainId: null,
    logo: null,
    isSeed: false,
    status: 'ACTIVE',
  }));
}

function group(id: string, name: string, stageId: string, teamIds: readonly string[]): Group {
  return { id, stageId, name, teamIds };
}

describe('groups + knockout fixture', () => {
  it('generates 8-team two-group fixture with 12 group matches and a 4-team knockout', () => {
    const groups = [
      group('A', 'A', 'groups-stage', ['A1', 'A2', 'A3', 'A4']),
      group('B', 'B', 'groups-stage', ['B1', 'B2', 'B3', 'B4']),
    ];
    const result = generateGroupsKnockoutFixture({
      groups,
      qualifiersPerGroup: 2,
      thirdPlaceMatch: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.stages.map((stage) => stage.type)).toEqual(['GROUPS', 'KNOCKOUT']);
    expect(result.value.groups).toEqual(groups);
    expect(result.value.matches.filter((match) => match.stageId === 'groups-stage')).toHaveLength(12);
    expect(result.value.matches.filter((match) => match.stageId === 'groups-knockout-stage')).toHaveLength(4);
    expect(result.value.matches.at(-1)?.label).toBe('Tercer puesto');
  });

  it('generates 11-team three-group fixture with byes and global match order', () => {
    const groups = [
      group('A', 'A', 'groups-stage', ['A1', 'A2', 'A3', 'A4']),
      group('B', 'B', 'groups-stage', ['B1', 'B2', 'B3', 'B4']),
      group('C', 'C', 'groups-stage', ['C1', 'C2', 'C3']),
    ];
    const result = generateGroupsKnockoutFixture({
      groups,
      qualifiersPerGroup: 2,
      thirdPlaceMatch: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.matches.filter((match) => match.stageId === 'groups-stage')).toHaveLength(15);
    expect(result.value.matches.filter((match) => match.stageId === 'groups-knockout-stage')).toHaveLength(5);
    expect(result.value.matches.map((match) => match.order)).toEqual(
      result.value.matches.map((_, index) => index + 1),
    );
  });

  it('uses level rankings to order cross-group position references', () => {
    const groups = [
      group('A', 'A', 'groups-stage', ['A1', 'A2', 'A3']),
      group('B', 'B', 'groups-stage', ['B1', 'B2', 'B3']),
    ];
    const result = generateGroupsKnockoutFixture({
      groups,
      qualifiersPerGroup: 2,
      levelRankings: [['B1', 'A1'], ['A2', 'B2']],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const knockout = result.value.matches.filter((match) => match.stageId === 'groups-knockout-stage');
    expect(knockout.some((match) =>
      match.home.kind === 'GROUP_POSITION' &&
      match.away.kind === 'GROUP_POSITION',
    )).toBe(true);
  });

  it('supports the public fixture contract and persists the group draw', () => {
    const result = generateFixture({
      teams: teams(['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4']),
      params: { format: 'GROUPS_KNOCKOUT', groupCount: 2, qualifiersPerGroup: 2, thirdPlaceMatch: false },
      draws: [],
      rng: createSeededRng('groups-knockout-test'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stages.map((stage) => stage.type)).toEqual(['GROUPS', 'KNOCKOUT']);
    expect(result.value.groups).toHaveLength(2);
    expect(result.value.matches.filter((match) => match.stageId === 'groups-stage')).toHaveLength(12);
    expect(result.value.newDraws).toHaveLength(1);
  });
});
