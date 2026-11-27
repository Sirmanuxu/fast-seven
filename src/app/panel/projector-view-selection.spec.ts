import { describe, expect, it } from 'vitest';
import {
  ProjectorViewSelectionData,
  createForcedProjectorView,
  isForcedProjectorViewAvailable,
  isProjectorViewKind,
} from './projector-view-selection';

const data: ProjectorViewSelectionData = {
  availableViews: ['STANDINGS', 'BRACKET', 'SCORERS'],
  brackets: [
    { id: 'cup-a', title: 'Copa de Oro' },
    { id: 'cup-b', title: 'Copa de Plata' },
  ],
};

describe('projector view selection', () => {
  it('pins all group standings together and keeps bracket scopes specific', () => {
    expect(createForcedProjectorView('STANDINGS', data)).toEqual({ kind: 'STANDINGS' });
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

  it('keeps legacy group-scoped pins while standings remain, but removes deleted brackets', () => {
    expect(
      isForcedProjectorViewAvailable({ kind: 'STANDINGS', groupId: 'removed-group' }, data),
    ).toBe(true);
    expect(isForcedProjectorViewAvailable({ kind: 'BRACKET', stageId: 'removed-cup' }, data)).toBe(
      false,
    );
  });
});
