import { describe, expect, it } from 'vitest';
import {
  ProjectorViewSelectionData,
  createForcedProjectorView,
  isForcedProjectorViewAvailable,
  isProjectorViewKind,
} from './projector-view-selection';

const data: ProjectorViewSelectionData = {
  availableViews: ['STANDINGS', 'BRACKET', 'SCORERS'],
  standings: [
    { id: 'group-a', title: 'Grupo A' },
    { id: 'group-b', title: 'Grupo B' },
  ],
  brackets: [
    { id: 'cup-a', title: 'Copa de Oro' },
    { id: 'cup-b', title: 'Copa de Plata' },
  ],
};

describe('projector view selection', () => {
  it('creates a group- or stage-specific forced view', () => {
    expect(createForcedProjectorView('STANDINGS', data)).toEqual({
      kind: 'STANDINGS',
      groupId: 'group-a',
    });
    expect(createForcedProjectorView('BRACKET', data)).toEqual({
      kind: 'BRACKET',
      stageId: 'cup-a',
    });
    expect(createForcedProjectorView('SCORERS', data)).toEqual({ kind: 'SCORERS' });
  });

  it('does not create views that are unavailable in the current data', () => {
    expect(createForcedProjectorView('NEXT_MATCH', data)).toBeNull();
    expect(isProjectorViewKind('SCORERS')).toBe(true);
    expect(isProjectorViewKind('NOT_A_VIEW')).toBe(false);
  });

  it('invalidates a pinned view if its group or stage disappears', () => {
    expect(isForcedProjectorViewAvailable({ kind: 'STANDINGS', groupId: 'group-a' }, data)).toBe(
      true,
    );
    expect(
      isForcedProjectorViewAvailable({ kind: 'STANDINGS', groupId: 'removed-group' }, data),
    ).toBe(false);
    expect(isForcedProjectorViewAvailable({ kind: 'BRACKET', stageId: 'removed-cup' }, data)).toBe(
      false,
    );
  });
});
