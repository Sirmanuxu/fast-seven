import { describe, expect, it } from 'vitest';
import { generateFixture } from './fixture';
import { generateGroupsCupsFixture } from './groups-cups';
import { createSeededRng } from './rng';
import { Group, MatchRef, Team } from './model';

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

describe('groups + cups fixture', () => {
  it('creates group games and four 3-team cups for 12 teams', () => {
    const result = generateGroupsCupsFixture({
      groups: [
        group('A', 'A', 'groups', ['A1', 'A2', 'A3', 'A4']),
        group('B', 'B', 'groups', ['B1', 'B2', 'B3', 'B4']),
        group('C', 'C', 'groups', ['C1', 'C2', 'C3', 'C4']),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.matches).toHaveLength(26);
    expect(result.value.stages.map((stage) => stage.cup)).toEqual([
      null,
      'GOLD',
      'SILVER',
      'BRONZE',
      'COPPER',
    ]);
    expect(
      result.value.matches.filter((match) => match.stageId === 'groups-cups-gold-stage'),
    ).toHaveLength(2);
    expect(result.value.matches.map((match) => match.order)).toEqual(
      result.value.matches.map((_, index) => index + 1),
    );
    const groupStageId = result.value.stages[0].id;
    expect(result.value.matches.slice(0, 3).every((match) => match.stageId === groupStageId)).toBe(
      true,
    );
    expect(result.value.matches.slice(18).every((match) => match.stageId !== groupStageId)).toBe(
      true,
    );
  });

  it('builds the smaller last cup and explains uneven groups', () => {
    const result = generateGroupsCupsFixture({
      groups: [
        group('A', 'A', 'groups', ['A1', 'A2', 'A3', 'A4']),
        group('B', 'B', 'groups', ['B1', 'B2', 'B3', 'B4']),
        group('C', 'C', 'groups', ['C1', 'C2', 'C3']),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const finalCup = result.value.stages.at(-1);
    expect(finalCup).toMatchObject({
      cup: 'COPPER',
      name: 'Copa de Cobre (2 equipos; grupos desparejos)',
    });
    expect(result.value.matches.filter((match) => match.stageId === finalCup?.id)).toHaveLength(1);
    expect(result.value.matches).toHaveLength(22);
  });

  it('seeds each cup by cross-group ranking and adds optional third place', () => {
    const result = generateGroupsCupsFixture({
      groups: [
        group('A', 'A', 'groups', ['A1', 'A2', 'A3', 'A4']),
        group('B', 'B', 'groups', ['B1', 'B2', 'B3', 'B4']),
        group('C', 'C', 'groups', ['C1', 'C2', 'C3', 'C4']),
        group('D', 'D', 'groups', ['D1', 'D2', 'D3', 'D4']),
      ],
      thirdPlaceMatch: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const goldStage = result.value.stages.find((stage) => stage.cup === 'GOLD');
    const goldMatches = result.value.matches.filter((match) => match.stageId === goldStage?.id);
    expect(goldMatches).toHaveLength(4);
    expect(goldMatches.some((match) => match.label === 'Tercer puesto')).toBe(true);
    const firstGoldRound = goldMatches.filter((match) => match.round === 1);
    expect(firstGoldRound).toHaveLength(2);
    expect(firstGoldRound[0].home).toEqual({ kind: 'LEVEL_POSITION', level: 1, position: 1 });
    expect(firstGoldRound[0].away).toEqual({ kind: 'LEVEL_POSITION', level: 1, position: 4 });
    expect(firstGoldRound[1].home).toEqual({ kind: 'LEVEL_POSITION', level: 1, position: 2 });
    expect(firstGoldRound[1].away).toEqual({ kind: 'LEVEL_POSITION', level: 1, position: 3 });
  });

  it('gives first-round byes to the highest-ranked seeds', () => {
    const result = generateGroupsCupsFixture({
      groups: ['A', 'B', 'C', 'D', 'E'].map((name) =>
        group(name, name, 'groups', [`${name}1`, `${name}2`]),
      ),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const goldStage = result.value.stages.find((stage) => stage.cup === 'GOLD');
    const firstRound = result.value.matches.filter(
      (match) => match.stageId === goldStage?.id && match.round === 1,
    );
    expect(firstRound).toHaveLength(1);
    expect(firstRound[0].home).toEqual({ kind: 'LEVEL_POSITION', level: 1, position: 4 });
    expect(firstRound[0].away).toEqual({ kind: 'LEVEL_POSITION', level: 1, position: 5 });
  });

  it('omits cups with one team and makes a two-team cup a single final', () => {
    const result = generateGroupsCupsFixture({
      groups: [
        group('A', 'A', 'groups', ['A1', 'A2', 'A3', 'A4']),
        group('B', 'B', 'groups', ['B1', 'B2', 'B3']),
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lastCup = result.value.stages.at(-1);
    expect(lastCup).toMatchObject({
      cup: 'BRONZE',
      name: 'Copa de Bronce (2 equipos; grupos desparejos)',
    });
    const matches = result.value.matches.filter((match) => match.stageId === lastCup?.id);
    expect(matches).toHaveLength(1);
    expect(matches[0].label).toBe('Final');
    const cupReferences: MatchRef[] = [matches[0].home, matches[0].away];
    expect(cupReferences).toEqual([
      { kind: 'LEVEL_POSITION', level: 3, position: 1 },
      { kind: 'LEVEL_POSITION', level: 3, position: 2 },
    ]);
  });

  it('reuses a saved group draw through the public fixture contract', () => {
    const savedGroups = [
      ['A1', 'A2', 'A3', 'A4'],
      ['B1', 'B2', 'B3', 'B4'],
      ['C1', 'C2', 'C3', 'C4'],
    ];
    const result = generateFixture({
      teams: teams(savedGroups.flat()),
      params: { format: 'GROUPS_CUPS', groupCount: 3, thirdPlaceMatch: false },
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
    expect(result.value.matches).toHaveLength(26);
  });

  it('rejects duplicate teams and groups too small for a round robin', () => {
    expect(
      generateGroupsCupsFixture({
        groups: [group('A', 'A', 'groups', ['A1', 'A2']), group('B', 'B', 'groups', ['A1', 'B2'])],
      }).ok,
    ).toBe(false);
    expect(
      generateGroupsCupsFixture({
        groups: [group('A', 'A', 'groups', ['A1']), group('B', 'B', 'groups', ['B1', 'B2'])],
      }).ok,
    ).toBe(false);
  });
});
