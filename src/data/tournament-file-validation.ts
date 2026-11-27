import { Result, TournamentFile, TournamentSnapshot } from '../domain/model';
import { normalizeTeamName } from '../domain/team';
import { TOURNAMENT_SCHEMA_VERSION } from './tournament-database';
import { checksumTournamentData, checksumTournamentValue } from './tournament-file';

export type TournamentFileValidationError =
  | 'INVALID_JSON'
  | 'INVALID_FORMAT'
  | 'NEWER_SCHEMA'
  | 'UNSUPPORTED_SCHEMA'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_STRUCTURE'
  | 'MISSING_IDS'
  | 'INVALID_REFERENCES';

export interface ValidatedTournamentFile {
  readonly file: TournamentFile;
  readonly migrated: boolean;
  readonly warnings: readonly TournamentFileInvariantWarning[];
}

export type TournamentFileInvariantWarning =
  | 'DUPLICATE_PLAYER_KEYS'
  | 'DUPLICATE_TEAM_NAMES'
  | 'MULTIPLE_MATCHES_IN_PROGRESS'
  | 'DETAIL_SCORE_MISMATCH'
  | 'ELIMINATION_TIE_WITHOUT_DECISION';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function hasKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in record);
}

function isRecordList(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function hasExpectedRows(
  value: unknown,
  requiredKeys: readonly string[],
): value is Record<string, unknown>[] {
  return isRecordList(value) && value.every((record) => hasKeys(record, requiredKeys));
}

function isTournamentSnapshot(value: unknown): value is TournamentSnapshot {
  if (!isRecord(value) || !isRecord(value['tournament'])) return false;
  const tournament = value['tournament'];
  if (
    !hasKeys(tournament, [
      'id',
      'name',
      'date',
      'status',
      'formatParams',
      'rules',
      'schedule',
      'categories',
      'backupIntervalMin',
      'schemaVersion',
      'createdAt',
      'updatedAt',
    ]) ||
    !isNonEmptyString(tournament['name']) ||
    !isString(tournament['date']) ||
    !['SETUP', 'FIXTURE_GENERATED', 'RUNNING', 'FINISHED'].includes(String(tournament['status'])) ||
    !isRecord(tournament['rules']) ||
    !isRecord(tournament['rules']['points']) ||
    !isRecord(tournament['rules']['points']['bonus']) ||
    !isStringList(tournament['rules']['tiebreakers']) ||
    !isRecord(tournament['rules']['walkoverScore']) ||
    !isRecord(tournament['rules']['bye']) ||
    !isRecord(tournament['rules']['roster']) ||
    !isRecord(tournament['schedule']) ||
    !hasExpectedRows(tournament['schedule']['breaks'], [
      'id',
      'label',
      'durationMin',
      'beforeMatchId',
    ]) ||
    !tournament['schedule']['breaks'].every(
      (scheduledBreak) =>
        isNonEmptyString(scheduledBreak['label']) &&
        isFiniteNumber(scheduledBreak['durationMin']) &&
        scheduledBreak['durationMin'] > 0 &&
        isNonEmptyString(scheduledBreak['beforeMatchId']),
    ) ||
    !hasExpectedRows(tournament['categories'], ['code', 'label', 'stage', 'aliases']) ||
    !tournament['categories'].every(
      (category) =>
        isNonEmptyString(category['code']) &&
        isString(category['label']) &&
        ['INFANT', 'YOUTH', 'ADULT'].includes(String(category['stage'])) &&
        isStringList(category['aliases']),
    ) ||
    !Number.isInteger(tournament['backupIntervalMin']) ||
    Number(tournament['backupIntervalMin']) < 1 ||
    Number(tournament['backupIntervalMin']) > 60 ||
    !Number.isInteger(tournament['schemaVersion']) ||
    !isString(tournament['createdAt']) ||
    !isString(tournament['updatedAt']) ||
    (tournament['formatParams'] !== null &&
      (!isRecord(tournament['formatParams']) ||
        ![
          'ROUND_ROBIN',
          'GROUPS_KNOCKOUT',
          'GROUPS_CUPS',
          'KNOCKOUT',
          'GROUPS_POSITION_PLAYOFFS',
          'SWISS',
          'DOUBLE_ELIMINATION',
        ].includes(String(tournament['formatParams']['format'])))) ||
    !isFiniteNumber(tournament['rules']['points']['win']) ||
    !isFiniteNumber(tournament['rules']['points']['draw']) ||
    !isFiniteNumber(tournament['rules']['points']['loss']) ||
    !isFiniteNumber(tournament['rules']['points']['walkoverLoss']) ||
    !hasKeys(tournament['rules']['points']['bonus'], [
      'triesThreshold',
      'triesBonusPoints',
      'losingMarginMax',
      'losingBonusPoints',
    ]) ||
    !isNullableFiniteNumber(tournament['rules']['points']['bonus']['triesThreshold']) ||
    !isFiniteNumber(tournament['rules']['points']['bonus']['triesBonusPoints']) ||
    !isNullableFiniteNumber(tournament['rules']['points']['bonus']['losingMarginMax']) ||
    !isFiniteNumber(tournament['rules']['points']['bonus']['losingBonusPoints']) ||
    !isFiniteNumber(tournament['rules']['walkoverScore']['winner']) ||
    !isFiniteNumber(tournament['rules']['walkoverScore']['loser']) ||
    typeof tournament['rules']['bye']['awardsWinPoints'] !== 'boolean' ||
    typeof tournament['rules']['bye']['countsScore'] !== 'boolean' ||
    !isFiniteNumber(tournament['rules']['roster']['min']) ||
    !isNullableFiniteNumber(tournament['rules']['roster']['max']) ||
    !isFiniteNumber(tournament['schedule']['matchDurationMin']) ||
    !isFiniteNumber(tournament['schedule']['restMin']) ||
    !isNullableString(tournament['schedule']['startTime'])
  ) {
    return false;
  }

  return (
    hasExpectedRows(value['players'], [
      'id',
      'firstName',
      'lastName',
      'category',
      'gender',
      'teamId',
      'disambiguation',
      'normalizedKey',
    ]) &&
    value['players'].every(
      (player) =>
        isNonEmptyString(player['firstName']) &&
        isNonEmptyString(player['lastName']) &&
        isNonEmptyString(player['category']) &&
        (player['gender'] === 'M' || player['gender'] === 'F') &&
        isNullableString(player['teamId']) &&
        isNullableString(player['disambiguation']) &&
        isString(player['normalizedKey']),
    ) &&
    hasExpectedRows(value['teams'], [
      'id',
      'name',
      'primaryColor',
      'secondaryColor',
      'captainId',
      'logo',
      'isSeed',
      'status',
    ]) &&
    value['teams'].every(
      (team) =>
        isNonEmptyString(team['name']) &&
        isString(team['primaryColor']) &&
        isString(team['secondaryColor']) &&
        isNullableString(team['captainId']) &&
        isNullableString(team['logo']) &&
        typeof team['isSeed'] === 'boolean' &&
        (team['status'] === 'ACTIVE' || team['status'] === 'WITHDRAWN'),
    ) &&
    hasExpectedRows(value['stages'], ['id', 'type', 'name', 'order', 'cup']) &&
    value['stages'].every(
      (stage) =>
        isNonEmptyString(stage['name']) &&
        [
          'GROUPS',
          'LEAGUE',
          'KNOCKOUT',
          'CUP',
          'SWISS',
          'WINNERS_BRACKET',
          'LOSERS_BRACKET',
          'GRAND_FINAL',
          'POSITION_PLAYOFFS',
        ].includes(String(stage['type'])) &&
        isFiniteNumber(stage['order']),
    ) &&
    hasExpectedRows(value['groups'], ['id', 'stageId', 'name', 'teamIds']) &&
    value['groups'].every(
      (group) => isNonEmptyString(group['name']) && isStringList(group['teamIds']),
    ) &&
    hasExpectedRows(value['matches'], [
      'id',
      'stageId',
      'groupId',
      'round',
      'order',
      'label',
      'home',
      'away',
      'status',
      'result',
      'startedAt',
      'finishedAt',
      'isPhantom',
      'isConditional',
    ]) &&
    value['matches'].every(
      (match) =>
        isFiniteNumber(match['round']) &&
        isFiniteNumber(match['order']) &&
        isNullableString(match['groupId']) &&
        isNullableString(match['label']) &&
        ['PENDING', 'IN_PROGRESS', 'FINISHED'].includes(String(match['status'])) &&
        (match['result'] === null || isRecord(match['result'])) &&
        isNullableString(match['startedAt']) &&
        isNullableString(match['finishedAt']) &&
        typeof match['isPhantom'] === 'boolean' &&
        typeof match['isConditional'] === 'boolean',
    ) &&
    hasExpectedRows(value['events'], [
      'id',
      'matchId',
      'teamId',
      'type',
      'playerId',
      'createdAt',
    ]) &&
    value['events'].every(
      (event) =>
        (event['type'] === 'TRY' || event['type'] === 'CONVERSION') &&
        isNullableString(event['playerId']) &&
        isString(event['createdAt']),
    ) &&
    hasExpectedRows(value['draws'], ['id', 'seed', 'createdAt', 'payload']) &&
    value['draws'].every(
      (draw) => isString(draw['seed']) && isString(draw['createdAt']) && isRecord(draw['payload']),
    )
  );
}

function migrateSchemaOne(data: Record<string, unknown>): unknown {
  if (!isRecord(data['tournament'])) return data;
  return {
    ...data,
    tournament: {
      ...data['tournament'],
      backupIntervalMin: data['tournament']['backupIntervalMin'] ?? 5,
      schemaVersion: TOURNAMENT_SCHEMA_VERSION,
    },
  };
}

function hasValidEntityIds(snapshot: TournamentSnapshot): boolean {
  const records = [
    snapshot.tournament,
    ...snapshot.players,
    ...snapshot.teams,
    ...snapshot.stages,
    ...snapshot.groups,
    ...snapshot.matches,
    ...snapshot.events,
    ...snapshot.draws,
  ];
  const ids = records.map((record) => record.id);
  return ids.every(isNonEmptyString) && new Set(ids).size === ids.length;
}

function hasValidReferences(snapshot: TournamentSnapshot): boolean {
  const playerIds = new Set(snapshot.players.map((player) => player.id));
  const teamIds = new Set(snapshot.teams.map((team) => team.id));
  const stageIds = new Set(snapshot.stages.map((stage) => stage.id));
  const groupIds = new Set(snapshot.groups.map((group) => group.id));
  const matchIds = new Set(snapshot.matches.map((match) => match.id));

  return (
    snapshot.players.every((player) => player.teamId === null || teamIds.has(player.teamId)) &&
    snapshot.teams.every(
      (team) =>
        team.captainId === null ||
        (playerIds.has(team.captainId) &&
          snapshot.players.some(
            (player) => player.id === team.captainId && player.teamId === team.id,
          )),
    ) &&
    snapshot.groups.every(
      (group) =>
        stageIds.has(group.stageId) && group.teamIds.every((teamId) => teamIds.has(teamId)),
    ) &&
    snapshot.matches.every(
      (match) =>
        stageIds.has(match.stageId) &&
        (match.groupId === null || groupIds.has(match.groupId)) &&
        isValidMatchReference(match.home, teamIds, groupIds, matchIds) &&
        isValidMatchReference(match.away, teamIds, groupIds, matchIds) &&
        isValidMatchResult(match.result, teamIds),
    ) &&
    snapshot.events.every(
      (event) =>
        matchIds.has(event.matchId) &&
        teamIds.has(event.teamId) &&
        (event.playerId === null || playerIds.has(event.playerId)),
    ) &&
    snapshot.tournament.schedule.breaks.every((item) => matchIds.has(item.beforeMatchId)) &&
    snapshot.draws.every((draw) => isValidDrawReferences(draw.payload, teamIds, stageIds))
  );
}

function getInvariantWarnings(snapshot: TournamentSnapshot): TournamentFileInvariantWarning[] {
  const warnings: TournamentFileInvariantWarning[] = [];
  const playerKeys = new Map<string, number>();
  const teamsByName = new Set<string>();
  const eventScores = new Map<string, Map<string, { tries: number; conversions: number }>>();

  for (const player of snapshot.players) {
    playerKeys.set(player.normalizedKey, (playerKeys.get(player.normalizedKey) ?? 0) + 1);
  }
  if (
    snapshot.players.some(
      (player) => (playerKeys.get(player.normalizedKey) ?? 0) > 1 && player.disambiguation === null,
    )
  ) {
    warnings.push('DUPLICATE_PLAYER_KEYS');
  }

  for (const team of snapshot.teams) {
    const normalizedName = normalizeTeamName(team.name);
    if (teamsByName.has(normalizedName)) {
      warnings.push('DUPLICATE_TEAM_NAMES');
      break;
    }
    teamsByName.add(normalizedName);
  }

  if (snapshot.matches.filter((match) => match.status === 'IN_PROGRESS').length > 1) {
    warnings.push('MULTIPLE_MATCHES_IN_PROGRESS');
  }

  for (const event of snapshot.events) {
    let scoresByTeam = eventScores.get(event.matchId);
    if (!scoresByTeam) {
      scoresByTeam = new Map();
      eventScores.set(event.matchId, scoresByTeam);
    }
    const score = scoresByTeam.get(event.teamId) ?? { tries: 0, conversions: 0 };
    if (event.type === 'TRY') score.tries += 1;
    if (event.type === 'CONVERSION') score.conversions += 1;
    scoresByTeam.set(event.teamId, score);
  }

  const stagesById = new Map(snapshot.stages.map((stage) => [stage.id, stage]));
  for (const match of snapshot.matches) {
    if (match.status !== 'FINISHED' || !match.result) continue;

    if (
      match.result.mode === 'DETAIL' &&
      match.home.kind === 'TEAM' &&
      match.away.kind === 'TEAM'
    ) {
      const eventScore = (teamId: string): number => {
        const score = eventScores.get(match.id)?.get(teamId);
        return (score?.tries ?? 0) * 5 + (score?.conversions ?? 0) * 2;
      };
      if (
        eventScore(match.home.teamId) !== match.result.homePoints ||
        eventScore(match.away.teamId) !== match.result.awayPoints
      ) {
        warnings.push('DETAIL_SCORE_MISMATCH');
      }
    }

    const stage = stagesById.get(match.stageId);
    const isEliminationStage =
      stage?.type === 'KNOCKOUT' ||
      stage?.type === 'CUP' ||
      stage?.type === 'WINNERS_BRACKET' ||
      stage?.type === 'LOSERS_BRACKET' ||
      stage?.type === 'GRAND_FINAL' ||
      stage?.type === 'POSITION_PLAYOFFS';
    if (
      isEliminationStage &&
      match.result.homePoints === match.result.awayPoints &&
      (match.result.definition !== 'SUDDEN_DEATH' || match.result.winnerTeamId === null)
    ) {
      warnings.push('ELIMINATION_TIE_WITHOUT_DECISION');
    }
  }

  return [...new Set(warnings)];
}

function isValidMatchResult(value: unknown, teamIds: ReadonlySet<string>): boolean {
  if (value === null) return true;
  if (
    !isRecord(value) ||
    !isFiniteNumber(value['homePoints']) ||
    !isFiniteNumber(value['awayPoints']) ||
    !isNullableString(value['winnerTeamId'])
  ) {
    return false;
  }
  if (value['winnerTeamId'] !== null && !teamIds.has(value['winnerTeamId'])) return false;
  const walkoverOrigin = value['walkoverOrigin'];
  return (
    walkoverOrigin === undefined ||
    (isRecord(walkoverOrigin) &&
      walkoverOrigin['kind'] === 'TEAM_WITHDRAWAL' &&
      isString(walkoverOrigin['teamId']) &&
      teamIds.has(walkoverOrigin['teamId']))
  );
}

function isValidMatchReference(
  value: unknown,
  teamIds: ReadonlySet<string>,
  groupIds: ReadonlySet<string>,
  matchIds: ReadonlySet<string>,
): boolean {
  if (!isRecord(value) || !isString(value['kind'])) return false;
  switch (value['kind']) {
    case 'TEAM':
      return isString(value['teamId']) && teamIds.has(value['teamId']);
    case 'GROUP_POSITION':
      return (
        isString(value['groupId']) &&
        groupIds.has(value['groupId']) &&
        Number.isInteger(value['position']) &&
        Number(value['position']) > 0
      );
    case 'LEVEL_POSITION':
      return (
        Number.isInteger(value['level']) &&
        Number(value['level']) > 0 &&
        Number.isInteger(value['position']) &&
        Number(value['position']) > 0
      );
    case 'WINNER_OF':
    case 'LOSER_OF':
      return isString(value['matchId']) && matchIds.has(value['matchId']);
    case 'BYE':
      return true;
    default:
      return false;
  }
}

function isValidDrawReferences(
  value: unknown,
  teamIds: ReadonlySet<string>,
  stageIds: ReadonlySet<string>,
): boolean {
  if (!isRecord(value) || !isString(value['kind'])) return false;
  switch (value['kind']) {
    case 'GROUPS':
    case 'TEAMS':
      return (
        Array.isArray(value['groups']) &&
        value['groups'].every(
          (group) => Array.isArray(group) && group.every((id) => isString(id) && teamIds.has(id)),
        )
      );
    case 'BRACKET':
    case 'SWISS_ROUND_ONE':
      return (
        isString(value['stageId']) &&
        stageIds.has(value['stageId']) &&
        Array.isArray(value['teamOrder']) &&
        value['teamOrder'].every((id) => isString(id) && teamIds.has(id))
      );
    case 'TIEBREAK':
      return (
        Array.isArray(value['tiedTeamIds']) &&
        value['tiedTeamIds'].every((id) => isString(id) && teamIds.has(id)) &&
        Array.isArray(value['order']) &&
        value['order'].every((id) => isString(id) && teamIds.has(id))
      );
    case 'BYE':
      return (
        isString(value['stageId']) &&
        stageIds.has(value['stageId']) &&
        isString(value['teamId']) &&
        teamIds.has(value['teamId'])
      );
    default:
      return false;
  }
}

function failure<T>(
  error: TournamentFileValidationError,
): Result<T, TournamentFileValidationError> {
  return { ok: false, error };
}

export async function validateTournamentFileText(
  text: string,
): Promise<Result<ValidatedTournamentFile, TournamentFileValidationError>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure('INVALID_JSON');
  }

  if (
    !isRecord(parsed) ||
    parsed['kind'] !== 'rugby7-tournament' ||
    !Number.isInteger(parsed['schemaVersion']) ||
    !isString(parsed['appVersion']) ||
    !isString(parsed['exportedAt']) ||
    !isString(parsed['checksum']) ||
    !('data' in parsed)
  ) {
    return failure('INVALID_FORMAT');
  }
  if (!Number.isFinite(Date.parse(parsed['exportedAt']))) {
    return failure('INVALID_FORMAT');
  }
  if (Number(parsed['schemaVersion']) > TOURNAMENT_SCHEMA_VERSION) return failure('NEWER_SCHEMA');
  if (Number(parsed['schemaVersion']) < 1) return failure('UNSUPPORTED_SCHEMA');
  if (!/^[a-f0-9]{64}$/i.test(parsed['checksum'])) return failure('INVALID_FORMAT');

  let originalChecksum: string;
  try {
    originalChecksum = await checksumTournamentValue(parsed['data']);
  } catch (error) {
    console.error('Checking the tournament file checksum failed', error);
    throw error;
  }
  if (originalChecksum.toLowerCase() !== parsed['checksum'].toLowerCase()) {
    return failure('CHECKSUM_MISMATCH');
  }

  const schemaVersion = Number(parsed['schemaVersion']);
  const migrated = schemaVersion < TOURNAMENT_SCHEMA_VERSION;
  const migratedData =
    migrated && schemaVersion === 1 && isRecord(parsed['data'])
      ? migrateSchemaOne(parsed['data'])
      : parsed['data'];
  if (!isTournamentSnapshot(migratedData)) return failure('INVALID_STRUCTURE');
  if (!hasValidEntityIds(migratedData)) return failure('MISSING_IDS');
  if (!hasValidReferences(migratedData)) return failure('INVALID_REFERENCES');

  const checksum = await checksumTournamentData(migratedData);
  return {
    ok: true,
    value: {
      migrated,
      file: {
        kind: 'rugby7-tournament',
        schemaVersion: TOURNAMENT_SCHEMA_VERSION,
        appVersion: parsed['appVersion'],
        exportedAt: parsed['exportedAt'],
        checksum,
        data: migratedData,
      },
      warnings: getInvariantWarnings(migratedData),
    },
  };
}
