import { describe, expect, it } from 'vitest';
import { generateFixture } from './fixture';
import { generateGroupsPositionPlayoffsFixture } from './groups-position-playoffs';
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

function group(id: string, teamIds: readonly string[]): Group {
  return { id, stageId: 'groups', name: id, teamIds };
}

describe('groups + position playoffs fixture', () => {
  it('creates direct position finals for two groups', () => {
    const result = generateGroupsPositionPlayoffsFixture({
      groups: [group('A', ['A1', 'A2', 'A3', 'A4']), group('B', ['B1', 'B2', 'B3', 'B4'])],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matches).toHaveLength(16);
    expect(
      result.value.matches.filter((match) => match.stageId === 'groups-position-stage'),
    ).toHaveLength(12);
    const finals = result.value.matches.filter(
      (match) => match.stageId !== 'groups-position-stage',
    );
    expect(finals).toHaveLength(4);
    expect(finals.map(({ home, away }) => [home, away])).toEqual(
      [1, 2, 3, 4].map((position) => [
        { kind: 'GROUP_POSITION', groupId: 'A', position },
        { kind: 'GROUP_POSITION', groupId: 'B', position },
      ]),
    );
    expect(finals.every((match) => match.label === 'Final')).toBe(true);
    expect(result.value.matches.map((match) => match.order)).toEqual(
      result.value.matches.map((_, index) => index + 1),
    );
  });

  it('uses round robin per level for three groups and explains uneven levels', () => {
    const result = generateGroupsPositionPlayoffsFixture({
      groups: [
        group('A', ['A1', 'A2', 'A3', 'A4']),
        group('B', ['B1', 'B2', 'B3', 'B4']),
        group('C', ['C1', 'C2', 'C3']),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matches).toHaveLength(25);
    const lastLevel = result.value.stages.at(-1);
    expect(lastLevel).toMatchObject({
      type: 'POSITION_PLAYOFFS',
      name: 'Nivel 4 (2 equipos; grupos desparejos)',
    });
    const lastLevelMatches = result.value.matches.filter(
      (match) => match.stageId === lastLevel?.id,
    );
    expect(lastLevelMatches).toHaveLength(1);
    expect(lastLevelMatches[0].home).toEqual({ kind: 'GROUP_POSITION', groupId: 'A', position: 4 });
    expect(lastLevelMatches[0].away).toEqual({ kind: 'GROUP_POSITION', groupId: 'B', position: 4 });
    for (const stage of result.value.stages.slice(1, 4)) {
      expect(result.value.matches.filter((match) => match.stageId === stage.id)).toHaveLength(3);
    }
  });

  it('keeps a singleton uneven level visible without creating a match', () => {
    const result = generateGroupsPositionPlayoffsFixture({
      groups: [
        group('A', ['A1', 'A2', 'A3', 'A4']),
        group('B', ['B1', 'B2', 'B3']),
        group('C', ['C1', 'C2', 'C3']),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lastLevel = result.value.stages.at(-1);
    expect(lastLevel?.name).toBe('Nivel 4 (1 equipo; grupos desparejos)');
    expect(result.value.matches.some((match) => match.stageId === lastLevel?.id)).toBe(false);
  });

  it('uses seeded elimination brackets for levels with more than four groups', () => {
    const result = generateGroupsPositionPlayoffsFixture({
      groups: ['A', 'B', 'C', 'D', 'E'].map((name) => group(name, [`${name}1`, `${name}2`])),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const firstLevel = result.value.stages[1];
    const matches = result.value.matches.filter((match) => match.stageId === firstLevel.id);
    expect(matches).toHaveLength(4);
    const firstRound = matches.filter((match) => match.round === 1);
    expect(firstRound).toHaveLength(1);
    expect(firstRound[0].home).toEqual({ kind: 'LEVEL_POSITION', level: 1, position: 4 });
    expect(firstRound[0].away).toEqual({ kind: 'LEVEL_POSITION', level: 1, position: 5 });
  });

  it('reuses a saved group draw through the public fixture contract', () => {
    const savedGroups = [
      ['A1', 'A2', 'A3', 'A4'],
      ['B1', 'B2', 'B3', 'B4'],
    ];
    const result = generateFixture({
      teams: teams(savedGroups.flat()),
      params: { format: 'GROUPS_POSITION_PLAYOFFS', groupCount: 2 },
      draws: [
        {
          id: 'saved-groups',
          seed: 'saved',
          createdAt: '2026-11-24T20:00:00.000Z',
          payload: { kind: 'GROUPS', groups: savedGroups },
        },
      ],
      rng: createSeededRng('unused'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.groups.map((entry) => entry.teamIds)).toEqual(savedGroups);
    expect(result.value.newDraws).toEqual([]);
    expect(result.value.matches).toHaveLength(16);
  });

  it('rejects duplicate teams and groups too small for a round robin', () => {
    expect(
      generateGroupsPositionPlayoffsFixture({
        groups: [group('A', ['A1', 'A2']), group('B', ['A1', 'B2'])],
      }).ok,
    ).toBe(false);
    expect(
      generateGroupsPositionPlayoffsFixture({
        groups: [group('A', ['A1']), group('B', ['B1', 'B2'])],
      }).ok,
    ).toBe(false);
  });
});
