import { Id, Match, ProjectorTimer, ProjectorViewKind, TournamentStatus } from './model';
import { parseIsoDateTime } from './schedule';

const DEFAULT_VIEW_DURATION_MS = 12_000;
const RECENT_RESULT_DURATION_MS = 15_000;

export type ProjectorContext =
  | 'BEFORE_START'
  | 'MATCH_IN_PROGRESS'
  | 'RECENT_RESULT'
  | 'BREAK'
  | 'BETWEEN_MATCHES'
  | 'FINISHED';

export interface AutomaticProjectorView {
  readonly kind: ProjectorViewKind;
  readonly matchId?: Id;
}

export interface ProjectorContextInput {
  readonly tournamentStatus: TournamentStatus | null;
  readonly matches: readonly Pick<
    Match,
    'id' | 'status' | 'finishedAt' | 'isPhantom' | 'isConditional'
  >[];
  readonly timer: ProjectorTimer | null;
  readonly nowEpochMs: number;
}

export interface ProjectorRotationConfig {
  readonly viewDurationMs?: number;
}

export interface ProjectorContextPlan {
  readonly context: ProjectorContext;
  readonly contextKey: string;
  readonly views: readonly AutomaticProjectorView[];
  readonly viewDurationMs: number;
  readonly resultMatchId: Id | null;
}

function configuredViewDuration(config: ProjectorRotationConfig): number {
  const duration = config.viewDurationMs;
  return duration !== undefined && Number.isFinite(duration) && duration > 0
    ? duration
    : DEFAULT_VIEW_DURATION_MS;
}

function mostRecentlyFinishedMatch(
  input: ProjectorContextInput,
): { readonly id: Id; readonly finishedAtEpochMs: number } | null {
  return input.matches.reduce<{
    readonly id: Id;
    readonly finishedAtEpochMs: number;
  } | null>((latest, match) => {
    if (
      match.status !== 'FINISHED' ||
      match.isPhantom ||
      match.isConditional ||
      !match.finishedAt
    ) {
      return latest;
    }

    const finishedAtEpochMs = parseIsoDateTime(match.finishedAt);
    if (
      finishedAtEpochMs === null ||
      finishedAtEpochMs > input.nowEpochMs ||
      (latest !== null && finishedAtEpochMs <= latest.finishedAtEpochMs)
    ) {
      return latest;
    }

    return { id: match.id, finishedAtEpochMs };
  }, null);
}

export function selectProjectorContext(
  input: ProjectorContextInput,
  config: ProjectorRotationConfig = {},
): ProjectorContextPlan {
  const viewDurationMs = configuredViewDuration(config);
  const status = input.tournamentStatus;
  if (status === 'SETUP' || status === 'FIXTURE_GENERATED' || status === null) {
    return {
      context: 'BEFORE_START',
      contextKey: 'BEFORE_START',
      views: [{ kind: 'TEAMS_AND_FIXTURE' }],
      viewDurationMs,
      resultMatchId: null,
    };
  }

  const currentMatch =
    status === 'RUNNING'
      ? input.matches.find((match) => match.status === 'IN_PROGRESS')
      : undefined;
  if (currentMatch) {
    return {
      context: 'MATCH_IN_PROGRESS',
      contextKey: `MATCH_IN_PROGRESS:${currentMatch.id}`,
      views: [{ kind: 'MATCH_PLATE', matchId: currentMatch.id }, { kind: 'NEXT_MATCH' }],
      viewDurationMs,
      resultMatchId: null,
    };
  }

  const latestFinishedMatch = mostRecentlyFinishedMatch(input);
  if (
    latestFinishedMatch &&
    input.nowEpochMs - latestFinishedMatch.finishedAtEpochMs < RECENT_RESULT_DURATION_MS
  ) {
    return {
      context: 'RECENT_RESULT',
      contextKey: `RECENT_RESULT:${latestFinishedMatch.id}`,
      views: [{ kind: 'MATCH_PLATE', matchId: latestFinishedMatch.id }],
      viewDurationMs: RECENT_RESULT_DURATION_MS,
      resultMatchId: latestFinishedMatch.id,
    };
  }

  if (status === 'FINISHED') {
    return {
      context: 'FINISHED',
      contextKey: 'FINISHED',
      views: [{ kind: 'FINAL_RESULT' }, { kind: 'FINAL_STANDINGS' }, { kind: 'SCORERS' }],
      viewDurationMs,
      resultMatchId: null,
    };
  }

  const isBreak = input.timer !== null && input.timer.endsAtEpochMs > input.nowEpochMs;
  const context = isBreak ? 'BREAK' : 'BETWEEN_MATCHES';
  return {
    context,
    contextKey: context,
    views: [{ kind: 'NEXT_MATCH' }, { kind: 'STANDINGS' }],
    viewDurationMs,
    resultMatchId: null,
  };
}
