import {
  DomainError,
  Draw,
  FormatParams,
  GenerateFixture,
  Group,
  Id,
  Match,
  MatchRef,
  Result,
  Stage,
} from './model';
import { createGroupDrawPlan, groupsFromPlan } from './group-draw';
import { generateKnockoutMatches, getKnockoutBracketSize, getStandardSeedOrder } from './knockout';
import { generateRoundRobinMatches } from './round-robin';

export interface GroupsPositionPlayoffsFixtureInput {
  readonly groups: readonly Group[];
  readonly groupStageId?: string;
  readonly matchIdPrefix?: string;
}

export interface GroupsPositionPlayoffsFixture {
  readonly stages: readonly Stage[];
  readonly groups: readonly Group[];
  readonly matches: readonly Match[];
}

function error(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `groupsPositionPlayoffs.${code}`, params } };
}

function positionRef(groupId: Id, position: number): MatchRef {
  return { kind: 'GROUP_POSITION', groupId, position };
}

function levelPositionRef(level: number, position: number): MatchRef {
  return { kind: 'LEVEL_POSITION', level, position };
}

function generateGroupMatches(
  groups: readonly Group[],
  stageId: Id,
  prefix: string,
): Result<readonly Match[], DomainError> {
  const roundMatches = new Map<number, Match[]>();
  for (const group of groups) {
    const fixture = generateRoundRobinMatches({
      teamIds: group.teamIds,
      rounds: 1,
      stageId,
      groupId: group.id,
      matchIdPrefix: `${prefix}-${group.id}`,
    });
    if (!fixture.ok) {
      return fixture;
    }
    for (const match of fixture.value) {
      const matches = roundMatches.get(match.round) ?? [];
      matches.push(match);
      roundMatches.set(match.round, matches);
    }
  }

  const matches: Match[] = [];
  for (const round of [...roundMatches.keys()].sort((left, right) => left - right)) {
    for (const match of roundMatches.get(round) ?? []) {
      matches.push({ ...match, order: matches.length + 1 });
    }
  }
  return { ok: true, value: matches };
}

function withGroupPositionRefs(match: Match, level: number): Match {
  const toPositionRef = (ref: MatchRef): MatchRef =>
    ref.kind === 'TEAM' ? positionRef(ref.teamId, level) : ref;
  return { ...match, home: toPositionRef(match.home), away: toPositionRef(match.away) };
}

function generateLevelMatches(
  groups: readonly Group[],
  level: number,
  stageId: Id,
  prefix: string,
): Result<readonly Match[], DomainError> {
  const levelGroups = groups.filter((group) => group.teamIds.length >= level);
  const participants = levelGroups.length;
  if (participants < 2) {
    return { ok: true, value: [] };
  }

  if (participants === 2) {
    return {
      ok: true,
      value: [
        {
          id: `${prefix}-level-${level}-final`,
          stageId,
          groupId: null,
          round: 1,
          order: 1,
          label: 'Final',
          home: positionRef(levelGroups[0].id, level),
          away: positionRef(levelGroups[1].id, level),
          status: 'PENDING',
          result: null,
          startedAt: null,
          finishedAt: null,
          isPhantom: false,
          isConditional: false,
        },
      ],
    };
  }

  if (participants <= 4) {
    const fixture = generateRoundRobinMatches({
      teamIds: levelGroups.map((group) => group.id),
      rounds: 1,
      stageId,
      matchIdPrefix: `${prefix}-level-${level}`,
    });
    if (!fixture.ok) {
      return fixture;
    }
    return { ok: true, value: fixture.value.map((match) => withGroupPositionRefs(match, level)) };
  }

  const bracketSize = getKnockoutBracketSize(participants);
  const slots = getStandardSeedOrder(bracketSize).map(
    (seed): MatchRef => (seed <= participants ? levelPositionRef(level, seed) : { kind: 'BYE' }),
  );
  return generateKnockoutMatches({
    teamIds: Array.from(
      { length: participants },
      (_, index) => `${prefix}-level-${level}-seed-${index + 1}`,
    ),
    stageId,
    matchIdPrefix: `${prefix}-level-${level}`,
    slotRefs: slots,
  });
}

export function generateGroupsPositionPlayoffsFixture(
  input: GroupsPositionPlayoffsFixtureInput,
): Result<GroupsPositionPlayoffsFixture, DomainError> {
  if (input.groups.length < 2) {
    return error('tooFewGroups', { minimum: 2 });
  }
  if (input.groups.some((group) => group.teamIds.length < 2)) {
    return error('insufficientGroupSize');
  }
  const allTeamIds = input.groups.flatMap((group) => group.teamIds);
  if (new Set(allTeamIds).size !== allTeamIds.length) {
    return error('duplicateTeams');
  }
  if (new Set(input.groups.map((group) => group.id)).size !== input.groups.length) {
    return error('duplicateGroups');
  }

  const groupStageId = input.groupStageId ?? 'groups-position-stage';
  const prefix = input.matchIdPrefix ?? 'groups-position';
  const groupMatches = generateGroupMatches(input.groups, groupStageId, prefix);
  if (!groupMatches.ok) {
    return groupMatches;
  }

  const maxGroupSize = Math.max(...input.groups.map((group) => group.teamIds.length));
  const stages: Stage[] = [
    { id: groupStageId, type: 'GROUPS', name: 'Fase de grupos', order: 1, cup: null },
  ];
  const matches = [...groupMatches.value];
  let globalOrder = matches.length + 1;

  for (let level = 1; level <= maxGroupSize; level += 1) {
    const participantCount = input.groups.filter((group) => group.teamIds.length >= level).length;
    const stageId = `${prefix}-level-${level}`;
    const unevenLevel = participantCount < input.groups.length;
    const participantLabel = participantCount === 1 ? 'equipo' : 'equipos';
    const name =
      input.groups.length === 2
        ? `Cruce de posiciones ${level}${unevenLevel ? ` (${participantCount} ${participantLabel}; grupos desparejos)` : ''}`
        : `Nivel ${level}${unevenLevel ? ` (${participantCount} ${participantLabel}; grupos desparejos)` : ''}`;
    stages.push({
      id: stageId,
      type: 'POSITION_PLAYOFFS',
      name,
      order: stages.length + 1,
      cup: null,
    });

    const levelMatches = generateLevelMatches(input.groups, level, stageId, prefix);
    if (!levelMatches.ok) {
      return levelMatches;
    }
    for (const match of levelMatches.value) {
      matches.push({ ...match, order: globalOrder });
      globalOrder += 1;
    }
  }

  return { ok: true, value: { stages, groups: input.groups, matches } };
}

export const generateGroupsPositionPlayoffsFixtureContract: GenerateFixture = (input) => {
  if (input.params.format !== 'GROUPS_POSITION_PLAYOFFS') {
    return error('unsupportedFormat');
  }
  const params: Extract<FormatParams, { readonly format: 'GROUPS_POSITION_PLAYOFFS' }> =
    input.params;
  if (!Number.isInteger(params.groupCount) || params.groupCount < 2) {
    return error('invalidGroupCount');
  }
  if (input.teams.length < params.groupCount * 2) {
    return error('insufficientTeams', { minimum: params.groupCount * 2 });
  }

  const existingDraw = input.draws.find(
    (draw) => draw.payload.kind === 'GROUPS' && draw.payload.groups.length === params.groupCount,
  );
  let groupTeamIds: readonly (readonly Id[])[];
  let newGroupDraw: Draw | null = null;
  if (existingDraw?.payload.kind === 'GROUPS') {
    groupTeamIds = existingDraw.payload.groups;
  } else {
    const plan = createGroupDrawPlan({
      teams: input.teams,
      groupCount: params.groupCount,
      drawId: 'groups-position-groups-draw',
      seed: 'groups-position',
      createdAt: '1970-01-01T00:00:00.000Z',
      rng: input.rng,
    });
    if (!plan.ok) {
      return plan;
    }
    groupTeamIds = plan.value.groupTeamIds;
    newGroupDraw = plan.value.draw;
  }

  const groups = groupsFromPlan('groups-position-stage', groupTeamIds);
  const fixture = generateGroupsPositionPlayoffsFixture({ groups });
  if (!fixture.ok) {
    return fixture;
  }
  return {
    ok: true,
    value: {
      stages: [...fixture.value.stages],
      groups: [...fixture.value.groups],
      matches: [...fixture.value.matches],
      newDraws: newGroupDraw === null ? [] : [newGroupDraw],
    },
  };
};
