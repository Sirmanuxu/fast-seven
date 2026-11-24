import { DomainError, Draw, Group, Result, Rng, Team } from './model';

export interface GroupDrawInput {
  readonly teams: readonly Team[];
  readonly groupCount: number;
  readonly drawId: string;
  readonly seed: string;
  readonly createdAt: string;
  readonly rng: Rng;
}

export interface GroupDrawPlan {
  readonly groupTeamIds: readonly (readonly string[])[];
  readonly groupSizes: readonly number[];
  readonly explanation: {
    readonly seededTeamIds: readonly string[];
    readonly unseededTeamIds: readonly string[];
    readonly uneven: boolean;
    readonly smallerGroupIndexes: readonly number[];
  };
  readonly draw: Draw;
}

export interface GroupMove {
  readonly teamId: string;
  readonly swapTeamId: string;
  readonly fromGroup: number;
  readonly toGroup: number;
}

function error(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `groupDraw.${code}`, params } };
}

function sizesFor(teamCount: number, groupCount: number): readonly number[] {
  const baseSize = Math.floor(teamCount / groupCount);
  const largerGroupCount = teamCount % groupCount;
  return Array.from(
    { length: groupCount },
    (_, index) => baseSize + (index < largerGroupCount ? 1 : 0),
  );
}

function assignSeededTeams(
  groups: string[][],
  sizes: readonly number[],
  seededTeamIds: readonly string[],
): void {
  for (let index = 0; index < seededTeamIds.length; index += 1) {
    const start = index % groups.length;
    for (let offset = 0; offset < groups.length; offset += 1) {
      const groupIndex = (start + offset) % groups.length;
      if (groups[groupIndex].length < sizes[groupIndex]) {
        groups[groupIndex].push(seededTeamIds[index]);
        break;
      }
    }
  }
}

export function createGroupDrawPlan(input: GroupDrawInput): Result<GroupDrawPlan, DomainError> {
  if (!Number.isInteger(input.groupCount) || input.groupCount < 1) {
    return error('invalidGroupCount');
  }
  if (input.teams.length < input.groupCount) {
    return error('tooManyGroups');
  }
  if (new Set(input.teams.map((team) => team.id)).size !== input.teams.length) {
    return error('duplicateTeams');
  }

  const sizes = sizesFor(input.teams.length, input.groupCount);
  const seeded = input.rng.shuffle(input.teams.filter((team) => team.isSeed));
  const unseeded = input.rng.shuffle(input.teams.filter((team) => !team.isSeed));
  const groups = sizes.map(() => [] as string[]);
  assignSeededTeams(
    groups,
    sizes,
    seeded.map((team) => team.id),
  );

  let unseededIndex = 0;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    while (groups[groupIndex].length < sizes[groupIndex]) {
      groups[groupIndex].push(unseeded[unseededIndex].id);
      unseededIndex += 1;
    }
  }

  const groupTeamIds = groups.map((group) => [...group]);
  const draw: Draw = {
    id: input.drawId,
    seed: input.seed,
    createdAt: input.createdAt,
    payload: { kind: 'GROUPS', groups: groupTeamIds },
  };

  return {
    ok: true,
    value: {
      groupTeamIds,
      groupSizes: sizes,
      explanation: {
        seededTeamIds: seeded.map((team) => team.id),
        unseededTeamIds: unseeded.map((team) => team.id),
        uneven: new Set(sizes).size > 1,
        smallerGroupIndexes: sizes
          .map((size, index) => ({ size, index }))
          .filter((entry) => entry.size === Math.min(...sizes))
          .map((entry) => entry.index),
      },
      draw,
    },
  };
}

export function moveTeamBetweenGroups(
  groupTeamIds: readonly (readonly string[])[],
  sizes: readonly number[],
  move: GroupMove,
): Result<readonly (readonly string[])[], DomainError> {
  if (
    groupTeamIds.length !== sizes.length ||
    groupTeamIds.some((group, index) => group.length !== sizes[index]) ||
    move.fromGroup < 0 ||
    move.fromGroup >= groupTeamIds.length ||
    move.toGroup < 0 ||
    move.toGroup >= groupTeamIds.length ||
    move.fromGroup === move.toGroup
  ) {
    return error('invalidMove');
  }
  const sourceTeamIndex = groupTeamIds[move.fromGroup].indexOf(move.teamId);
  if (sourceTeamIndex < 0) {
    return error('teamNotInSource');
  }
  const targetTeamIndex = groupTeamIds[move.toGroup].indexOf(move.swapTeamId);
  if (targetTeamIndex < 0 || move.teamId === move.swapTeamId) {
    return error('teamNotInTarget');
  }

  const movedGroups = groupTeamIds.map((group) => [...group]);
  movedGroups[move.fromGroup][sourceTeamIndex] = move.swapTeamId;
  movedGroups[move.toGroup][targetTeamIndex] = move.teamId;
  return { ok: true, value: movedGroups };
}

export function groupsFromPlan(
  stageId: string,
  groupTeamIds: readonly (readonly string[])[],
  groupIds: readonly string[] = groupTeamIds.map((_, index) => `${stageId}-group-${index + 1}`),
): readonly Group[] {
  return groupTeamIds.map((teamIds, index) => ({
    id: groupIds[index],
    stageId,
    name: String.fromCharCode(65 + index),
    teamIds: [...teamIds],
  }));
}
