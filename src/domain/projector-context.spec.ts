import { describe, expect, it } from 'vitest';
import { ProjectorContextInput, selectProjectorContext } from './projector-context';

const nowEpochMs = Date.parse('2026-11-27T12:00:00.000Z');

function match(
  id: string,
  status: 'IN_PROGRESS' | 'FINISHED',
  finishedAt: string | null = null,
  isPhantom = false,
  isConditional = false,
): ProjectorContextInput['matches'][number] {
  return { id, status, finishedAt, isPhantom, isConditional };
}

function input(overrides: Partial<ProjectorContextInput> = {}): ProjectorContextInput {
  return {
    tournamentStatus: 'RUNNING',
    matches: [],
    timer: null,
    nowEpochMs,
    ...overrides,
  };
}

describe('selectProjectorContext', () => {
  it('shows teams and fixture before the tournament starts', () => {
    const plan = selectProjectorContext(input({ tournamentStatus: 'FIXTURE_GENERATED' }));

    expect(plan.context).toBe('BEFORE_START');
    expect(plan.views).toEqual([{ kind: 'TEAMS_AND_FIXTURE' }]);
  });

  it('starts on the live match and alternates with the next match', () => {
    const plan = selectProjectorContext(input({ matches: [match('live', 'IN_PROGRESS')] }));

    expect(plan.context).toBe('MATCH_IN_PROGRESS');
    expect(plan.contextKey).toBe('MATCH_IN_PROGRESS:live');
    expect(plan.views).toEqual([{ kind: 'MATCH_PLATE', matchId: 'live' }, { kind: 'NEXT_MATCH' }]);
    expect(plan.viewDurationMs).toBe(12_000);
  });

  it('shows a finished match for 15 seconds, then returns to the break context', () => {
    const justFinished = match('finished', 'FINISHED', '2026-11-27T11:59:50.000Z');
    const resultPlan = selectProjectorContext(input({ matches: [justFinished] }));

    expect(resultPlan.context).toBe('RECENT_RESULT');
    expect(resultPlan.views).toEqual([{ kind: 'MATCH_PLATE', matchId: 'finished' }]);
    expect(resultPlan.resultMatchId).toBe('finished');
    expect(resultPlan.viewDurationMs).toBe(15_000);

    const breakPlan = selectProjectorContext(
      input({
        matches: [justFinished],
        timer: { name: 'Descanso', endsAtEpochMs: nowEpochMs + 30_000 },
        nowEpochMs: nowEpochMs + 5_000,
      }),
    );
    expect(breakPlan.context).toBe('BREAK');
    expect(breakPlan.views).toEqual([{ kind: 'NEXT_MATCH' }, { kind: 'STANDINGS' }]);

    const expiredTimerPlan = selectProjectorContext(
      input({ timer: { name: 'Descanso', endsAtEpochMs: nowEpochMs - 1 } }),
    );
    expect(expiredTimerPlan.context).toBe('BETWEEN_MATCHES');

    const betweenPlan = selectProjectorContext(
      input({
        matches: [justFinished],
        nowEpochMs: nowEpochMs + 5_000,
      }),
    );
    expect(betweenPlan.context).toBe('BETWEEN_MATCHES');
  });

  it('uses the configured duration and the standard duration for invalid values', () => {
    expect(selectProjectorContext(input(), { viewDurationMs: 8_000 }).viewDurationMs).toBe(8_000);
    expect(selectProjectorContext(input(), { viewDurationMs: 0 }).viewDurationMs).toBe(12_000);
  });

  it('shows final standings, results, and scorers when the tournament is finished', () => {
    const plan = selectProjectorContext(input({ tournamentStatus: 'FINISHED' }));

    expect(plan.context).toBe('FINISHED');
    expect(plan.views).toEqual([
      { kind: 'FINAL_RESULT' },
      { kind: 'FINAL_STANDINGS' },
      { kind: 'SCORERS' },
    ]);
  });

  it('shows the last match result briefly before the finished-tournament views', () => {
    const finishedMatch = match('final', 'FINISHED', '2026-11-27T11:59:50.000Z');
    const resultPlan = selectProjectorContext(
      input({ tournamentStatus: 'FINISHED', matches: [finishedMatch] }),
    );
    const finalPlan = selectProjectorContext(
      input({
        tournamentStatus: 'FINISHED',
        matches: [finishedMatch],
        nowEpochMs: nowEpochMs + 5_000,
      }),
    );

    expect(resultPlan.context).toBe('RECENT_RESULT');
    expect(resultPlan.resultMatchId).toBe('final');
    expect(finalPlan.context).toBe('FINISHED');
  });

  it('does not use phantom or conditional matches for the recent result', () => {
    const plan = selectProjectorContext(
      input({
        matches: [
          match('phantom', 'FINISHED', '2026-11-27T11:59:59.000Z', true),
          match('conditional', 'FINISHED', '2026-11-27T11:59:58.000Z', false, true),
        ],
      }),
    );

    expect(plan.context).toBe('BETWEEN_MATCHES');
    expect(plan.resultMatchId).toBeNull();
  });
});
