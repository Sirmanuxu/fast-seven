import { ComputeSchedule, Id, Match, MatchRef, ResolvedMatch, ScheduleEntry, TournamentSnapshot } from './model';

const DAY_MS = 86_400_000;

export interface TeamRestSummary {
  readonly teamId: Id;
  readonly teamName: string;
  readonly minimumRestMin: number | null;
}

export interface ConsecutiveAppearance {
  readonly teamId: Id;
  readonly teamName: string;
  readonly firstMatchId: Id;
  readonly secondMatchId: Id;
}

export interface ScheduleDetails {
  readonly entries: readonly ScheduleEntry[];
  readonly orderedMatchIds: readonly Id[];
  readonly minimumRestByTeam: readonly TeamRestSummary[];
  readonly consecutiveAppearances: readonly ConsecutiveAppearance[];
}

interface ScheduleMatch {
  readonly matchId: Id;
  readonly isEstimateOnly: boolean;
}

interface OrderingScore {
  readonly consecutive: number;
  readonly minimumGap: number;
  readonly totalGap: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(daysSinceEpoch: number): { readonly year: number; readonly month: number; readonly day: number } {
  const shiftedDays = daysSinceEpoch + 719468;
  const era = Math.floor(shiftedDays / 146097);
  const dayOfEra = shiftedDays - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function parseIsoDateTime(value: string): number | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  const hour = Number(parts[4]);
  const minute = Number(parts[5]);
  const second = Number(parts[6]);
  const milliseconds = Number((parts[7] ?? '').padEnd(3, '0').slice(0, 3) || 0);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }
  return (
    daysFromCivil(year, month, day) * DAY_MS +
    hour * 3_600_000 +
    minute * 60_000 +
    second * 1_000 +
    milliseconds
  );
}

function formatIsoDateTime(epochMs: number): string {
  const days = Math.floor(epochMs / DAY_MS);
  let remainingMs = epochMs - days * DAY_MS;
  const { year, month, day } = civilFromDays(days);
  const hour = Math.floor(remainingMs / 3_600_000);
  remainingMs -= hour * 3_600_000;
  const minute = Math.floor(remainingMs / 60_000);
  remainingMs -= minute * 60_000;
  const second = Math.floor(remainingMs / 1_000);
  const milliseconds = remainingMs - second * 1_000;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}Z`;
}

function matchTeamIds(
  match: Match,
  resolved: ReadonlyMap<Id, ResolvedMatch>,
): ReadonlySet<Id> {
  const resolution = resolved.get(match.id);
  if (resolution) {
    return new Set(
      [resolution.homeTeamId, resolution.awayTeamId].filter((teamId): teamId is Id => teamId !== null),
    );
  }
  return new Set(
    [match.home, match.away]
      .filter((ref): ref is Extract<MatchRef, { readonly kind: 'TEAM' }> => ref.kind === 'TEAM')
      .map((ref) => ref.teamId),
  );
}

function overlapCount(left: ReadonlySet<Id>, right: ReadonlySet<Id>): number {
  return [...left].filter((teamId) => right.has(teamId)).length;
}

function scoreOrder(matches: readonly Match[], resolved: ReadonlyMap<Id, ResolvedMatch>): OrderingScore {
  const teamSets = matches.map((match) => matchTeamIds(match, resolved));
  let consecutive = 0;
  for (let index = 1; index < teamSets.length; index += 1) {
    consecutive += overlapCount(teamSets[index - 1], teamSets[index]);
  }

  const positionsByTeam = new Map<Id, number[]>();
  for (const [index, teamIds] of teamSets.entries()) {
    for (const teamId of teamIds) {
      const positions = positionsByTeam.get(teamId) ?? [];
      positions.push(index);
      positionsByTeam.set(teamId, positions);
    }
  }
  let minimumGap = Number.POSITIVE_INFINITY;
  let totalGap = 0;
  for (const positions of positionsByTeam.values()) {
    for (let index = 1; index < positions.length; index += 1) {
      const gap = positions[index] - positions[index - 1] - 1;
      minimumGap = Math.min(minimumGap, gap);
      totalGap += gap;
    }
  }
  return { consecutive, minimumGap, totalGap };
}

function isBetterScore(candidate: OrderingScore, current: OrderingScore): boolean {
  return (
    candidate.consecutive < current.consecutive ||
    (candidate.consecutive === current.consecutive &&
      (candidate.minimumGap > current.minimumGap ||
        (candidate.minimumGap === current.minimumGap && candidate.totalGap > current.totalGap)))
  );
}

function chooseBlockOrder(
  prefix: readonly Match[],
  block: readonly Match[],
  resolved: ReadonlyMap<Id, ResolvedMatch>,
  pendingIds: ReadonlySet<Id>,
): readonly Match[] {
  if (block.length > 8) {
    const remaining = [...block];
    const ordered = [...prefix];
    while (remaining.length > 0) {
      let selectedIndex = 0;
      let selectedScore: OrderingScore | null = null;
      for (let index = 0; index < remaining.length; index += 1) {
        const dependencies = matchDependencies(remaining[index]);
        if (
          dependencies.some(
            (dependencyId) => pendingIds.has(dependencyId) && !ordered.some((match) => match.id === dependencyId),
          )
        ) {
          continue;
        }
        const score = scoreOrder([...ordered, remaining[index]], resolved);
        if (selectedScore === null || isBetterScore(score, selectedScore)) {
          selectedIndex = index;
          selectedScore = score;
        }
      }
      if (selectedScore === null) {
        ordered.push(...remaining);
        break;
      }
      ordered.push(remaining.splice(selectedIndex, 1)[0]);
    }
    return ordered.slice(prefix.length);
  }

  let bestOrder = [...block];
  let bestScore = scoreOrder([...prefix, ...bestOrder], resolved);
  const remaining = [...block];
  const current: Match[] = [];
  const visit = (): void => {
    if (remaining.length === 0) {
      const positions = new Map(
        [...prefix, ...current].map((match, index) => [match.id, index]),
      );
      const dependenciesAreSatisfied = current.every((match) =>
        matchDependencies(match).every((dependencyId) => {
          if (!pendingIds.has(dependencyId)) return true;
          const dependencyPosition = positions.get(dependencyId);
          const matchPosition = positions.get(match.id);
          return dependencyPosition !== undefined && matchPosition !== undefined && dependencyPosition < matchPosition;
        }),
      );
      if (!dependenciesAreSatisfied) return;
      const score = scoreOrder([...prefix, ...current], resolved);
      if (isBetterScore(score, bestScore)) {
        bestScore = score;
        bestOrder = [...current];
      }
      return;
    }
    for (let index = 0; index < remaining.length; index += 1) {
      const [match] = remaining.splice(index, 1);
      current.push(match);
      visit();
      current.pop();
      remaining.splice(index, 0, match);
    }
  };
  visit();
  return bestOrder;
}

function matchDependencies(match: Match): readonly Id[] {
  return [match.home, match.away]
    .filter(
      (reference): reference is Extract<MatchRef, { readonly kind: 'WINNER_OF' | 'LOSER_OF' }> =>
        reference.kind === 'WINNER_OF' || reference.kind === 'LOSER_OF',
    )
    .map((reference) => reference.matchId);
}

function orderPendingMatches(
  matches: readonly Match[],
  snapshot: TournamentSnapshot,
  resolved: ReadonlyMap<Id, ResolvedMatch>,
): readonly Match[] {
  const stageOrder = new Map(snapshot.stages.map((stage) => [stage.id, stage.order]));
  const stageTypes = new Map(snapshot.stages.map((stage) => [stage.id, stage.type]));
  const pending = matches
    .filter(
      (match) =>
        match.status === 'PENDING' &&
        !match.isPhantom &&
        !match.isConditional &&
        match.home.kind !== 'BYE' &&
        match.away.kind !== 'BYE',
    )
    .sort((left, right) => {
      const leftGroupPhase = stageTypes.get(left.stageId) === 'GROUPS' ? 0 : 1;
      const rightGroupPhase = stageTypes.get(right.stageId) === 'GROUPS' ? 0 : 1;
      return (
        leftGroupPhase - rightGroupPhase ||
        left.round - right.round ||
        (stageOrder.get(left.stageId) ?? Number.MAX_SAFE_INTEGER) -
          (stageOrder.get(right.stageId) ?? Number.MAX_SAFE_INTEGER) ||
        left.order - right.order
      );
    });

  const pendingIds = new Set(pending.map((match) => match.id));
  const remaining = [...pending];
  const dependencyOrdered: Match[] = [];
  while (remaining.length > 0) {
    const nextIndex = remaining.findIndex((match) =>
      matchDependencies(match).every(
        (dependencyId) =>
          !pendingIds.has(dependencyId) ||
          dependencyOrdered.some((scheduled) => scheduled.id === dependencyId),
      ),
    );
    if (nextIndex === -1) {
      dependencyOrdered.push(...remaining);
      break;
    }
    dependencyOrdered.push(remaining.splice(nextIndex, 1)[0]);
  }

  const ordered: Match[] = [];
  let blockStart = 0;
  while (blockStart < dependencyOrdered.length) {
    const first = dependencyOrdered[blockStart];
    const phase = stageTypes.get(first.stageId) === 'GROUPS' ? 'groups' : 'playoffs';
    const key = `${phase}-${first.round}`;
    let blockEnd = blockStart + 1;
    while (blockEnd < dependencyOrdered.length) {
      const candidate = dependencyOrdered[blockEnd];
      const candidatePhase = stageTypes.get(candidate.stageId) === 'GROUPS' ? 'groups' : 'playoffs';
      if (`${candidatePhase}-${candidate.round}` !== key) break;
      blockEnd += 1;
    }
    ordered.push(
      ...chooseBlockOrder(ordered, dependencyOrdered.slice(blockStart, blockEnd), resolved, pendingIds),
    );
    blockStart = blockEnd;
  }
  return ordered;
}

function baseStartTime(snapshot: TournamentSnapshot, now: number): number | null {
  const inProgress = snapshot.matches.find(
    (match) => match.status === 'IN_PROGRESS' && match.startedAt !== null,
  );
  if (inProgress?.startedAt) {
    const startedAt = parseIsoDateTime(inProgress.startedAt);
    if (startedAt === null) return null;
    const expectedEnd = startedAt + snapshot.tournament.schedule.matchDurationMin * 60_000;
    return Math.max(expectedEnd, now) + snapshot.tournament.schedule.restMin * 60_000;
  }

  const lastFinishedAt = snapshot.matches
    .flatMap((match) => {
      if (
        match.status !== 'FINISHED' ||
        match.finishedAt === null ||
        match.isPhantom
      ) {
        return [];
      }
      const finishedAt = parseIsoDateTime(match.finishedAt);
      return finishedAt === null ? [] : [finishedAt];
    })
    .reduce<number | null>((latest, value) => (latest === null ? value : Math.max(latest, value)), null);
  if (lastFinishedAt !== null) {
    return lastFinishedAt + snapshot.tournament.schedule.restMin * 60_000;
  }
  const startTime = snapshot.tournament.schedule.startTime;
  return startTime === null ? null : parseIsoDateTime(startTime);
}

function futureSwissMatches(snapshot: TournamentSnapshot): readonly ScheduleMatch[] {
  const params = snapshot.tournament.formatParams;
  if (params?.format !== 'SWISS') return [];
  const swissStageIds = new Set(
    snapshot.stages.filter((stage) => stage.type === 'SWISS').map((stage) => stage.id),
  );
  const existingMatches = snapshot.matches.filter((match) => swissStageIds.has(match.stageId));
  const lastRound = existingMatches.reduce((maximum, match) => Math.max(maximum, match.round), 0);
  const matchCountPerRound = Math.floor(snapshot.teams.filter((team) => team.status === 'ACTIVE').length / 2);
  const estimates: ScheduleMatch[] = [];
  for (let round = lastRound + 1; round <= params.rounds; round += 1) {
    for (let matchNumber = 1; matchNumber <= matchCountPerRound; matchNumber += 1) {
      const matchId = `swiss-round-${round}-match-${matchNumber}-estimate`;
      estimates.push({ matchId, isEstimateOnly: true });
    }
  }
  return estimates;
}

export function computeScheduleDetails(
  snapshot: TournamentSnapshot,
  now: number,
  resolvedMatches: readonly ResolvedMatch[] = [],
): ScheduleDetails {
  const resolvedById = new Map(resolvedMatches.map((match) => [match.matchId, match]));
  const orderedMatches = orderPendingMatches(snapshot.matches, snapshot, resolvedById);
  const estimatedMatches: ScheduleMatch[] = [
    ...orderedMatches.map((match) => ({
      matchId: match.id,
      isEstimateOnly: false,
    })),
    ...futureSwissMatches(snapshot),
  ];
  const start = baseStartTime(snapshot, now);
  if (start === null || !Number.isFinite(start)) {
    return {
      entries: [],
      orderedMatchIds: orderedMatches.map((match) => match.id),
      minimumRestByTeam: [],
      consecutiveAppearances: [],
    };
  }

  const entries: ScheduleEntry[] = [];
  let currentStart = start;
  for (const match of estimatedMatches) {
    const scheduledBreaks = snapshot.tournament.schedule.breaks
      .filter((entry) => entry.beforeMatchId === match.matchId)
      .reduce((total, entry) => total + entry.durationMin, 0);
    currentStart += scheduledBreaks * 60_000;
    entries.push({
      matchId: match.matchId,
      estimatedStart: formatIsoDateTime(currentStart),
      isEstimateOnly: match.isEstimateOnly,
    });
    currentStart +=
      (snapshot.tournament.schedule.matchDurationMin + snapshot.tournament.schedule.restMin) *
      60_000;
  }

  const entryByMatchId = new Map(entries.map((entry) => [entry.matchId, entry]));
  const timesByTeam = new Map<Id, number[]>();
  for (const match of orderedMatches) {
    const entry = entryByMatchId.get(match.id);
    const startTime = entry ? parseIsoDateTime(entry.estimatedStart) : null;
    if (startTime === null) continue;
    for (const teamId of matchTeamIds(match, resolvedById)) {
      const times = timesByTeam.get(teamId) ?? [];
      times.push(startTime);
      timesByTeam.set(teamId, times);
    }
  }

  const minimumRestByTeam = snapshot.teams.map((team) => {
    const times = [...(timesByTeam.get(team.id) ?? [])].sort((left, right) => left - right);
    let minimumRest: number | null = null;
    for (let index = 1; index < times.length; index += 1) {
      const restMin =
        (times[index] - times[index - 1] - snapshot.tournament.schedule.matchDurationMin * 60_000) /
        60_000;
      minimumRest = minimumRest === null ? restMin : Math.min(minimumRest, restMin);
    }
    return { teamId: team.id, teamName: team.name, minimumRestMin: minimumRest };
  });

  const consecutiveAppearances: ConsecutiveAppearance[] = [];
  for (let index = 1; index < orderedMatches.length; index += 1) {
    const first = orderedMatches[index - 1];
    const second = orderedMatches[index];
    for (const teamId of matchTeamIds(first, resolvedById)) {
      if (matchTeamIds(second, resolvedById).has(teamId)) {
        consecutiveAppearances.push({
          teamId,
          teamName: snapshot.teams.find((team) => team.id === teamId)?.name ?? teamId,
          firstMatchId: first.id,
          secondMatchId: second.id,
        });
      }
    }
  }

  return {
    entries,
    orderedMatchIds: orderedMatches.map((match) => match.id),
    minimumRestByTeam,
    consecutiveAppearances,
  };
}

export const computeSchedule: ComputeSchedule = (snapshot, now) =>
  computeScheduleDetails(snapshot, now).entries;
