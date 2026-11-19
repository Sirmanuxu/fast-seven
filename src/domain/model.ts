/**
 * Domain model contract: src/domain/model.ts
 *
 * Source of truth for requirements: docs/BACKLOG.md (section 3 and the user stories).
 * Source of truth for expected behavior: docs/REFERENCE_CASES.md.
 *
 * Rules for this file:
 *  - Types and constants only. No logic, no imports from Angular or the browser.
 *  - Everything stored is JSON-serializable: ids are UUID v4 strings, dates are ISO 8601
 *    UTC strings. The only epoch number is `ProjectorTimer.endsAtEpochMs`.
 *  - Anything marked "(derived)" is NEVER persisted. It is computed from stored data.
 *  - If you need to change this file, stop and ask (AGENTS.md, section 9).
 */

// ---------------------------------------------------------------------------
// Primitives and infrastructure
// ---------------------------------------------------------------------------

export type Id = string;
export type IsoDateTime = string;

/** Domain functions return Result instead of throwing. */
export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Seeded random source. Domain code never calls Math.random. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Returns a new shuffled array, does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
}

/** Injected clock. Domain code never calls Date.now or new Date(). */
export interface Clock {
  nowMs(): number;
}

export type CreateRng = (seed: string) => Rng;

// ---------------------------------------------------------------------------
// Categories and players
// ---------------------------------------------------------------------------

export type Gender = 'M' | 'F';

export type CategoryStage = 'INFANT' | 'YOUTH' | 'ADULT';

/** Configurable catalog entry (backlog 3.9). `code` is what gets stored on players. */
export interface Category {
  readonly code: string;
  /** Spanish label shown in the UI. */
  readonly label: string;
  readonly stage: CategoryStage;
  /**
   * Extra spellings accepted by the importer, lowercase. Numeric categories (M7..M19)
   * are additionally recognized by rule: optional "m" or "sub" prefix, optional space or
   * hyphen, then the number ("m16", "M 16", "Sub16", "sub-16", "16").
   */
  readonly aliases: readonly string[];
}

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { code: 'ESCUELITA', label: 'Escuelita', stage: 'INFANT', aliases: ['escuelita'] },
  { code: 'M7', label: 'M7', stage: 'INFANT', aliases: [] },
  { code: 'M8', label: 'M8', stage: 'INFANT', aliases: [] },
  { code: 'M9', label: 'M9', stage: 'INFANT', aliases: [] },
  { code: 'M10', label: 'M10', stage: 'INFANT', aliases: [] },
  { code: 'M11', label: 'M11', stage: 'INFANT', aliases: [] },
  { code: 'M12', label: 'M12', stage: 'INFANT', aliases: [] },
  { code: 'M13', label: 'M13', stage: 'YOUTH', aliases: [] },
  { code: 'M14', label: 'M14', stage: 'YOUTH', aliases: [] },
  { code: 'M15', label: 'M15', stage: 'YOUTH', aliases: [] },
  { code: 'M16', label: 'M16', stage: 'YOUTH', aliases: [] },
  { code: 'M17', label: 'M17', stage: 'YOUTH', aliases: [] },
  { code: 'M18', label: 'M18', stage: 'YOUTH', aliases: [] },
  { code: 'M19', label: 'M19', stage: 'YOUTH', aliases: [] },
  {
    code: 'PLANTEL_SUPERIOR',
    label: 'Plantel Superior',
    stage: 'ADULT',
    aliases: ['plantel superior', 'primera', 'intermedia', 'preintermedia'],
  },
  { code: 'VETERANOS', label: 'Veteranos', stage: 'ADULT', aliases: ['veteranos', 'vet', '+35'] },
];

export interface Player {
  readonly id: Id;
  readonly firstName: string;
  readonly lastName: string;
  /** Category code from the tournament catalog. */
  readonly category: string;
  readonly gender: Gender;
  /** Null means the player is unassigned ("suelto"). */
  readonly teamId: Id | null;
  /** Disambiguation for exact namesakes, for example "(2)". */
  readonly disambiguation: string | null;
  /**
   * (derived, indexed) firstName + lastName + category, lowercase, without diacritics,
   * apostrophes removed, hyphens turned into spaces, whitespace collapsed.
   */
  readonly normalizedKey: string;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export type TeamStatus = 'ACTIVE' | 'WITHDRAWN';

export interface Team {
  readonly id: Id;
  /** Unique after normalization. A/B/C subdivisions live in the name ("M16 A"). */
  readonly name: string;
  /** "#RRGGBB" */
  readonly primaryColor: string;
  /** "#RRGGBB" */
  readonly secondaryColor: string;
  /** Must be a player whose teamId is this team. Null when empty. */
  readonly captainId: Id | null;
  /** Reserved for a future feature. No screen in the MVP. */
  readonly logo: string | null;
  readonly isSeed: boolean;
  readonly status: TeamStatus;
}

// ---------------------------------------------------------------------------
// Rules and configuration
// ---------------------------------------------------------------------------

export type Tiebreaker =
  | 'HEAD_TO_HEAD'
  | 'POINT_DIFFERENCE'
  | 'POINTS_FOR'
  | 'TRIES_FOR'
  | 'BUCHHOLZ'
  | 'DRAW';

export interface BonusRules {
  /** Tries needed in a match to earn the tries bonus. Null disables it. */
  readonly triesThreshold: number | null;
  readonly triesBonusPoints: number;
  /** A loss by this many points or fewer earns the losing bonus. Null disables it. */
  readonly losingMarginMax: number | null;
  readonly losingBonusPoints: number;
}

export interface PointsRules {
  readonly win: number;
  readonly draw: number;
  readonly loss: number;
  /** Table points for the team that loses by walkover. Default 0 even if `loss` is 1. */
  readonly walkoverLoss: number;
  readonly bonus: BonusRules;
}

export interface WalkoverScore {
  readonly winner: number;
  readonly loser: number;
}

export interface ByeRules {
  /** The bye awards the same table points as a win. */
  readonly awardsWinPoints: boolean;
  /** The bye adds a score (uses WalkoverScore) to points for/against. Default false. */
  readonly countsScore: boolean;
}

export interface RosterLimits {
  readonly min: number;
  /** Null means no upper limit. Only produces a warning. */
  readonly max: number | null;
}

export interface TournamentRules {
  readonly points: PointsRules;
  /** Ordered. DRAW is always applied last, even if missing from the list. */
  readonly tiebreakers: readonly Tiebreaker[];
  readonly walkoverScore: WalkoverScore;
  readonly bye: ByeRules;
  readonly roster: RosterLimits;
}

export interface ScheduledBreak {
  readonly id: Id;
  readonly label: string;
  readonly durationMin: number;
  /** The break is placed right before this match. */
  readonly beforeMatchId: Id;
}

export interface ScheduleConfig {
  readonly startTime: IsoDateTime | null;
  readonly matchDurationMin: number;
  readonly restMin: number;
  readonly breaks: readonly ScheduledBreak[];
}

export const RUGBY_POINTS = { try: 5, conversion: 2 } as const;

export const PRESET_POINTS_3_2_1: PointsRules = {
  win: 3,
  draw: 2,
  loss: 1,
  walkoverLoss: 0,
  bonus: { triesThreshold: null, triesBonusPoints: 0, losingMarginMax: null, losingBonusPoints: 0 },
};

export const PRESET_POINTS_4_2_0_BONUS: PointsRules = {
  win: 4,
  draw: 2,
  loss: 0,
  walkoverLoss: 0,
  bonus: { triesThreshold: 4, triesBonusPoints: 1, losingMarginMax: 7, losingBonusPoints: 1 },
};

export const DEFAULT_TIEBREAKERS: readonly Tiebreaker[] = [
  'HEAD_TO_HEAD',
  'POINT_DIFFERENCE',
  'POINTS_FOR',
  'TRIES_FOR',
  'DRAW',
];

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

export type FormatId =
  | 'ROUND_ROBIN'
  | 'GROUPS_KNOCKOUT'
  | 'GROUPS_CUPS'
  | 'KNOCKOUT'
  | 'GROUPS_POSITION_PLAYOFFS'
  | 'SWISS'
  | 'DOUBLE_ELIMINATION';

export type FormatParams =
  | { readonly format: 'ROUND_ROBIN'; readonly rounds: 1 | 2 }
  | {
      readonly format: 'GROUPS_KNOCKOUT';
      readonly groupCount: number;
      readonly qualifiersPerGroup: number;
      readonly thirdPlaceMatch: boolean;
    }
  | { readonly format: 'GROUPS_CUPS'; readonly groupCount: number; readonly thirdPlaceMatch: boolean }
  | { readonly format: 'KNOCKOUT'; readonly thirdPlaceMatch: boolean }
  | { readonly format: 'GROUPS_POSITION_PLAYOFFS'; readonly groupCount: number }
  | { readonly format: 'SWISS'; readonly rounds: number }
  | { readonly format: 'DOUBLE_ELIMINATION'; readonly grandFinalReset: boolean };

export type TournamentStatus = 'SETUP' | 'FIXTURE_GENERATED' | 'RUNNING' | 'FINISHED';

export interface Tournament {
  readonly id: Id;
  readonly name: string;
  readonly date: IsoDateTime;
  readonly status: TournamentStatus;
  readonly formatParams: FormatParams | null;
  readonly rules: TournamentRules;
  readonly schedule: ScheduleConfig;
  readonly categories: readonly Category[];
  readonly backupIntervalMin: number;
  readonly schemaVersion: number;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Stages, groups and matches
// ---------------------------------------------------------------------------

export type StageType =
  | 'GROUPS'
  | 'LEAGUE'
  | 'KNOCKOUT'
  | 'CUP'
  | 'SWISS'
  | 'WINNERS_BRACKET'
  | 'LOSERS_BRACKET'
  | 'GRAND_FINAL'
  | 'POSITION_PLAYOFFS';

export type CupName = 'GOLD' | 'SILVER' | 'BRONZE' | 'COPPER' | string;

export interface Stage {
  readonly id: Id;
  readonly type: StageType;
  readonly name: string;
  readonly order: number;
  /** Only for CUP stages. */
  readonly cup: CupName | null;
}

export interface Group {
  readonly id: Id;
  readonly stageId: Id;
  /** "A", "B", "C"... */
  readonly name: string;
  /** Team ids in the order they were drawn. */
  readonly teamIds: readonly Id[];
}

/**
 * A slot in a match is a reference, never a fixed team (except TEAM, used where teams
 * are known up front). Resolution is a pure function (see ResolveMatches).
 */
export type MatchRef =
  | { readonly kind: 'TEAM'; readonly teamId: Id }
  /** Final position `position` (1-based) of a group. Resolves when that group is complete. */
  | { readonly kind: 'GROUP_POSITION'; readonly groupId: Id; readonly position: number }
  /**
   * Cross-group ranking: among all teams that finished `level`-th in their groups,
   * the one ranked `position` by the comparison in backlog HU-18.
   */
  | { readonly kind: 'LEVEL_POSITION'; readonly level: number; readonly position: number }
  | { readonly kind: 'WINNER_OF'; readonly matchId: Id }
  | { readonly kind: 'LOSER_OF'; readonly matchId: Id }
  | { readonly kind: 'BYE' };

export type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'FINISHED';
export type ResultMode = 'DETAIL' | 'DIRECT' | 'WALKOVER';
export type ResultDefinition = 'REGULAR' | 'SUDDEN_DEATH' | 'WALKOVER';

export interface MatchResult {
  readonly mode: ResultMode;
  readonly homePoints: number;
  readonly awayPoints: number;
  readonly definition: ResultDefinition;
  /**
   * Required when definition is SUDDEN_DEATH or WALKOVER. Null otherwise: the winner is
   * derived from the points. Cleared automatically if an edit makes the score non-tied.
   */
  readonly winnerTeamId: Id | null;
}

export interface Match {
  readonly id: Id;
  readonly stageId: Id;
  readonly groupId: Id | null;
  /** Round within its stage (1-based). */
  readonly round: number;
  /** Position in the single-pitch sequence. Pending matches can be reordered. */
  readonly order: number;
  /** Human label such as "Semifinal 1". Optional. */
  readonly label: string | null;
  readonly home: MatchRef;
  readonly away: MatchRef;
  readonly status: MatchStatus;
  /** Null until the match is FINISHED. Live score during play comes from events. */
  readonly result: MatchResult | null;
  readonly startedAt: IsoDateTime | null;
  readonly finishedAt: IsoDateTime | null;
  /**
   * Double elimination with byes: a match with a missing participant that resolves by
   * itself. Never shown, never counted, never scheduled.
   */
  readonly isPhantom: boolean;
  /**
   * Grand final reset: exists only if needed. When the winners-bracket champion wins the
   * grand final, it is "not needed": it does not count as pending and does not block closing.
   */
  readonly isConditional: boolean;
}

export type MatchEventType = 'TRY' | 'CONVERSION';

export interface MatchEvent {
  readonly id: Id;
  readonly matchId: Id;
  /** One of the two teams of the match. */
  readonly teamId: Id;
  readonly type: MatchEventType;
  /** Null means "no author". If set, the player must belong to teamId. */
  readonly playerId: Id | null;
  readonly createdAt: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Draws (persisted randomness)
// ---------------------------------------------------------------------------

export type DrawPayload =
  | { readonly kind: 'GROUPS'; readonly groups: readonly (readonly Id[])[] }
  | { readonly kind: 'TEAMS'; readonly teams: readonly (readonly Id[])[] }
  | { readonly kind: 'BRACKET'; readonly stageId: Id; readonly teamOrder: readonly Id[] }
  | { readonly kind: 'TIEBREAK'; readonly tiedTeamIds: readonly Id[]; readonly order: readonly Id[] }
  | { readonly kind: 'BYE'; readonly stageId: Id; readonly round: number; readonly teamId: Id }
  | { readonly kind: 'SWISS_ROUND_ONE'; readonly stageId: Id; readonly teamOrder: readonly Id[] };

export interface Draw {
  readonly id: Id;
  readonly seed: string;
  readonly createdAt: IsoDateTime;
  readonly payload: DrawPayload;
}

// ---------------------------------------------------------------------------
// Projector, backups, export file
// ---------------------------------------------------------------------------

export type ProjectorViewKind =
  | 'TEAMS_AND_FIXTURE'
  | 'MATCH_PLATE'
  | 'NEXT_MATCH'
  | 'SHORT_LIST'
  | 'STANDINGS'
  | 'BRACKET'
  | 'SCORERS'
  | 'FINAL_RESULT'
  | 'FINAL_STANDINGS';

export interface ProjectorView {
  readonly kind: ProjectorViewKind;
  /** Which group, cup or stage, when the view needs one. */
  readonly stageId?: Id;
  readonly groupId?: Id;
}

export interface ProjectorTimer {
  readonly name: string;
  /** Stored as an end time, not remaining seconds, so it survives refreshes. */
  readonly endsAtEpochMs: number;
}

export interface ProjectorMessage {
  /** Plain text, up to 140 characters. Never rendered as HTML. */
  readonly text: string;
  readonly mode: 'BANNER' | 'FULLSCREEN';
}

export interface ProjectorState {
  /** Null means automatic rotation by context. */
  readonly forcedView: ProjectorView | null;
  readonly message: ProjectorMessage | null;
  readonly timer: ProjectorTimer | null;
}

export type BackupReason =
  | 'TOURNAMENT_START'
  | 'MATCH_FINISHED'
  | 'PERIODIC'
  | 'BEFORE_IMPORT'
  | 'BEFORE_LOAD_FILE'
  | 'BEFORE_CASCADE_EDIT'
  | 'BEFORE_RESET'
  | 'MANUAL';

/** Everything that defines a tournament. ProjectorState is intentionally excluded. */
export interface TournamentSnapshot {
  readonly tournament: Tournament;
  readonly players: readonly Player[];
  readonly teams: readonly Team[];
  readonly stages: readonly Stage[];
  readonly groups: readonly Group[];
  readonly matches: readonly Match[];
  readonly events: readonly MatchEvent[];
  readonly draws: readonly Draw[];
}

export interface Backup {
  readonly id: Id;
  readonly createdAt: IsoDateTime;
  readonly reason: BackupReason;
  readonly snapshot: TournamentSnapshot;
}

/** Saved tournament file (HU-49, HU-50). */
export interface TournamentFile {
  readonly kind: 'rugby7-tournament';
  readonly schemaVersion: number;
  readonly appVersion: string;
  readonly exportedAt: IsoDateTime;
  /** Checksum of `data` to detect corrupt or truncated files. */
  readonly checksum: string;
  readonly data: TournamentSnapshot;
}

// ---------------------------------------------------------------------------
// Derived types (never persisted)
// ---------------------------------------------------------------------------

export interface TieBreakInfo {
  /** The criterion that decided this team's position against the teams it was tied with. */
  readonly criterion: Tiebreaker;
  readonly comparedTeamIds: readonly Id[];
  /** Values compared per team, when the criterion is numeric. */
  readonly values: Readonly<Record<Id, number>> | null;
}

export interface StandingsRow {
  readonly teamId: Id;
  /** 1-based. Tied teams never share a position: the tiebreakers (ending in DRAW) separate them. */
  readonly position: number;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly pointsFor: number;
  readonly pointsAgainst: number;
  readonly pointDifference: number;
  /** Tries scored, counting only DETAIL matches. */
  readonly triesFor: number;
  /** True if some match of this team has no detail, so triesFor is incomplete. */
  readonly triesIncomplete: boolean;
  readonly bonusPoints: number;
  readonly tablePoints: number;
  readonly withdrawn: boolean;
  /** Null when no tie was involved. */
  readonly tiebreak: TieBreakInfo | null;
}

export interface ScorerRow {
  readonly playerId: Id;
  /** Current team of the player. */
  readonly teamId: Id | null;
  readonly tries: number;
  readonly conversions: number;
  /** tries * 5 + conversions * 2 */
  readonly points: number;
}

export interface ResolvedMatch {
  readonly matchId: Id;
  readonly homeTeamId: Id | null;
  readonly awayTeamId: Id | null;
  /** Spanish text for unresolved slots, for example "1° Grupo A", "Ganador partido #14". */
  readonly homeLabel: string;
  readonly awayLabel: string;
  /** Both sides resolved and not a bye or phantom. Only playable matches can go IN_PROGRESS. */
  readonly isPlayable: boolean;
}

export interface ScheduleEntry {
  readonly matchId: Id;
  readonly estimatedStart: IsoDateTime;
  /** True for future swiss rounds that do not exist yet. */
  readonly isEstimateOnly: boolean;
}

export interface CapacityOption {
  readonly teamCount: number;
  /** For example [{ size: 9, count: 5 }, { size: 8, count: 1 }]. */
  readonly rosterSizes: readonly { readonly size: number; readonly count: number }[];
}

export interface Warning {
  readonly code: string;
  /** Message key in src/i18n. */
  readonly messageKey: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface FormatOption {
  readonly format: FormatId;
  readonly viable: boolean;
  /** i18n key explaining why it is not viable. */
  readonly notViableReasonKey: string | null;
  readonly suggestedParams: FormatParams | null;
  readonly totalMatches: number;
  readonly minMatchesPerTeam: number;
  readonly estimatedDurationMin: number;
  readonly warnings: readonly Warning[];
}

export type ImportRowStatus = 'OK' | 'WARNING' | 'ERROR';

export interface ImportRow {
  /** 1-based, as seen in the source file (header excluded). */
  readonly rowNumber: number;
  readonly raw: Readonly<Record<string, string>>;
  readonly normalized: {
    readonly firstName: string;
    readonly lastName: string;
    readonly category: string | null;
    readonly gender: Gender | null;
    readonly teamName: string | null;
  };
  readonly status: ImportRowStatus;
  readonly issues: readonly Warning[];
}

export interface AffectedMatch {
  readonly matchId: Id;
  readonly status: MatchStatus;
  readonly beforeHomeTeamId: Id | null;
  readonly beforeAwayTeamId: Id | null;
  readonly afterHomeTeamId: Id | null;
  readonly afterAwayTeamId: Id | null;
  /** True if the match had a result that would be lost. */
  readonly losesResult: boolean;
}

export interface EditImpact {
  /** Empty means the edit can be saved without a warning (backlog HU-38). */
  readonly affected: readonly AffectedMatch[];
}

// ---------------------------------------------------------------------------
// Public domain API (signatures only; implementations live in src/domain)
// ---------------------------------------------------------------------------

export type DomainError = { readonly code: string; readonly messageKey: string; readonly params?: Readonly<Record<string, string | number>> };

export type ComputeScore = (events: readonly MatchEvent[], homeTeamId: Id, awayTeamId: Id) => Result<{ home: number; away: number }, DomainError>;

export type IsScoreReachable = (points: number) => boolean;

export type ComputeStandings = (input: {
  readonly teamIds: readonly Id[];
  readonly matches: readonly Match[];
  readonly events: readonly MatchEvent[];
  readonly teams: readonly Team[];
  readonly rules: TournamentRules;
  readonly draws: readonly Draw[];
  readonly rng: Rng;
}) => { readonly rows: readonly StandingsRow[]; readonly newDraws: readonly Draw[] };

export type CompareAcrossGroups = (input: {
  readonly groups: readonly Group[];
  readonly matches: readonly Match[];
  readonly events: readonly MatchEvent[];
  readonly rules: TournamentRules;
  readonly level: number;
}) => { readonly ranking: readonly StandingsRow[]; readonly excludedMatchIds: readonly Id[]; readonly isProvisional: boolean };

export type ComputeScorers = (input: {
  readonly players: readonly Player[];
  readonly matches: readonly Match[];
  readonly events: readonly MatchEvent[];
  readonly filter?: { readonly category?: string; readonly gender?: Gender };
}) => { readonly rows: readonly ScorerRow[]; readonly unattributedTries: number };

export type ResolveMatches = (snapshot: TournamentSnapshot, rng: Rng) => readonly ResolvedMatch[];

export type GenerateFixture = (input: {
  readonly teams: readonly Team[];
  readonly params: FormatParams;
  readonly draws: readonly Draw[];
  readonly rng: Rng;
}) => Result<{ stages: Stage[]; groups: Group[]; matches: Match[]; newDraws: Draw[] }, DomainError>;

export type ComputeCapacity = (playerCount: number, roster: RosterLimits) => readonly CapacityOption[];

export type ComputeFormatOptions = (teamCount: number, schedule: ScheduleConfig) => readonly FormatOption[];

export type ComputeSchedule = (snapshot: TournamentSnapshot, now: number) => readonly ScheduleEntry[];

export type AnalyzeEditImpact = (before: TournamentSnapshot, after: TournamentSnapshot) => EditImpact;

export type NormalizePlayerKey = (firstName: string, lastName: string, category: string) => string;

export type NormalizeCategory = (raw: string, catalog: readonly Category[]) => string | null;

export type NormalizeGender = (raw: string) => Gender | null;
