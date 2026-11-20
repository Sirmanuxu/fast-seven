import { DomainError, Draw, Player, Result, Rng, RosterLimits } from './model';

export interface TeamDrawTarget {
  readonly id: string;
  readonly currentPlayerCount: number;
}

export interface TeamDrawInput {
  readonly players: readonly Player[];
  readonly targets: readonly TeamDrawTarget[];
  readonly roster: RosterLimits;
  readonly balanceByCategoryGender: boolean;
  readonly drawId: string;
  readonly seed: string;
  readonly createdAt: string;
  readonly rng: Rng;
}

export interface TeamDrawAssignment {
  readonly targetId: string;
  readonly playerIds: readonly string[];
}

export interface TeamDrawPlan {
  readonly assignments: readonly TeamDrawAssignment[];
  readonly draw: Draw;
}

function error(
  code: string,
  params?: Readonly<Record<string, string | number>>,
): Result<never, DomainError> {
  return { ok: false, error: { code, messageKey: `teamDraw.${code}`, params } };
}

function groupPlayers(players: readonly Player[], rng: Rng): readonly (readonly Player[])[] {
  const grouped = new Map<string, Player[]>();
  for (const player of players) {
    const key = `${player.category}|${player.gender}`;
    const group = grouped.get(key) ?? [];
    group.push(player);
    grouped.set(key, group);
  }

  return rng.shuffle([...grouped.values()]).map((group) => rng.shuffle(group));
}

export function createTeamDrawPlan(input: TeamDrawInput): Result<TeamDrawPlan, DomainError> {
  if (input.players.length === 0) {
    return error('noPlayers');
  }
  if (input.targets.length === 0) {
    return error('noTargets');
  }
  if (
    !Number.isInteger(input.roster.min) ||
    input.roster.min <= 0 ||
    (input.roster.max !== null &&
      (!Number.isInteger(input.roster.max) || input.roster.max < input.roster.min))
  ) {
    return error('invalidRosterLimits');
  }
  if (
    input.targets.some(
      (target) =>
        !target.id || !Number.isInteger(target.currentPlayerCount) || target.currentPlayerCount < 0,
    )
  ) {
    return error('invalidTargets');
  }
  if (new Set(input.targets.map((target) => target.id)).size !== input.targets.length) {
    return error('duplicateTargets');
  }

  const maximumRosterSize = input.roster.max ?? Number.POSITIVE_INFINITY;
  const minimumRequired = input.targets.reduce(
    (total, target) => total + Math.max(0, input.roster.min - target.currentPlayerCount),
    0,
  );
  const maximumCapacity = input.targets.reduce(
    (total, target) => total + Math.max(0, maximumRosterSize - target.currentPlayerCount),
    0,
  );
  if (input.players.length < minimumRequired) {
    return error('notEnoughPlayers', {
      maximumPossible: Math.floor(input.players.length / input.roster.min),
    });
  }
  if (input.players.length > maximumCapacity) {
    return error('tooManyPlayers');
  }

  const playerGroups = input.balanceByCategoryGender
    ? groupPlayers(input.players, input.rng)
    : [input.rng.shuffle(input.players)];
  const assignments = input.targets.map((target) => ({
    targetId: target.id,
    playerIds: [] as string[],
  }));
  const counts = input.targets.map((target) => target.currentPlayerCount);
  let targetIndex = 0;

  for (const group of playerGroups) {
    for (const player of group) {
      let attempts = 0;
      while (attempts < assignments.length && counts[targetIndex] >= maximumRosterSize) {
        targetIndex = (targetIndex + 1) % assignments.length;
        attempts += 1;
      }
      if (attempts === assignments.length) {
        return error('tooManyPlayers');
      }
      assignments[targetIndex].playerIds.push(player.id);
      counts[targetIndex] += 1;
      targetIndex = (targetIndex + 1) % assignments.length;
    }
  }

  if (counts.some((count) => count < input.roster.min)) {
    return error('notEnoughPlayers', {
      maximumPossible: Math.floor(input.players.length / input.roster.min),
    });
  }

  const draw: Draw = {
    id: input.drawId,
    seed: input.seed,
    createdAt: input.createdAt,
    payload: {
      kind: 'TEAMS',
      teams: assignments.map((assignment) => assignment.playerIds),
    },
  };
  return { ok: true, value: { assignments, draw } };
}
