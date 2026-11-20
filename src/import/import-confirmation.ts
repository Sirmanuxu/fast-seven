import { Team, TournamentStatus } from '../domain/model';
import { normalizeTeamName } from '../domain/team';
import { ImportPreviewRow, editDistance } from './import-preview';

export type DuplicateAction = 'SKIP' | 'UPDATE_TEAM' | 'DISTINCT';

export interface TeamResolution {
  readonly incomingName: string;
  readonly existingTeamId: string | null;
  readonly action: 'CREATE' | 'MERGE';
}

export interface ImportConfirmationPlan {
  readonly teamResolutions: readonly TeamResolution[];
  readonly duplicateActions: Readonly<Record<number, DuplicateAction>>;
  readonly createdPlayerCount: number;
  readonly skippedPlayerCount: number;
  readonly createdTeamCount: number;
  readonly underMinimumTeamCount: number;
}

function trailingTokenDifference(left: string, right: string): boolean {
  const normalizedLeft = normalizeTeamName(left);
  const normalizedRight = normalizeTeamName(right);
  if (normalizedLeft === normalizedRight) return false;
  if (/^.+ [a-z]$/i.test(normalizedLeft) && /^.+ [a-z]$/i.test(normalizedRight)) {
    const leftPrefix = normalizedLeft.slice(0, normalizedLeft.lastIndexOf(' '));
    const rightPrefix = normalizedRight.slice(0, normalizedRight.lastIndexOf(' '));
    return leftPrefix === rightPrefix;
  }
  if (/^.+ \d+$/.test(normalizedLeft) && /^.+ \d+$/.test(normalizedRight)) {
    const leftPrefix = normalizedLeft.replace(/ \d+$/, '');
    const rightPrefix = normalizedRight.replace(/ \d+$/, '');
    return leftPrefix === rightPrefix;
  }
  return false;
}

export function proposeTeamResolutions(
  rows: readonly ImportPreviewRow[],
  existingTeams: readonly Team[],
  tournamentStatus: TournamentStatus,
): readonly TeamResolution[] {
  const incomingNames = new Map<string, string>();
  for (const row of rows) {
    if (row.discarded || !row.normalizedTeamName) continue;
    const normalized = normalizeTeamName(row.normalizedTeamName);
    if (!incomingNames.has(normalized)) incomingNames.set(normalized, row.normalizedTeamName);
  }

  const resolutions: TeamResolution[] = [];
  for (const [normalized, incomingName] of incomingNames) {
    const exact = existingTeams.find((team) => normalizeTeamName(team.name) === normalized);
    if (exact) {
      resolutions.push({
        incomingName,
        existingTeamId: exact.id,
        action: 'MERGE',
      });
      continue;
    }

    if (tournamentStatus === 'RUNNING') {
      resolutions.push({
        incomingName,
        existingTeamId: null,
        action: 'CREATE',
      });
      continue;
    }

    const similar = existingTeams.find((team) => {
      if (trailingTokenDifference(team.name, incomingName)) return false;
      return editDistance(normalizeTeamName(team.name), normalized) <= 2;
    });
    resolutions.push({
      incomingName,
      existingTeamId: similar?.id ?? null,
      action: similar ? 'MERGE' : 'CREATE',
    });
  }
  return resolutions;
}

export function buildConfirmationPlan(
  rows: readonly ImportPreviewRow[],
  teamResolutions: readonly TeamResolution[],
  existingTeamCounts: Readonly<Record<string, number>>,
  tournamentStatus: TournamentStatus,
  minimumRosterSize: number,
  duplicateActions: Readonly<Record<number, DuplicateAction>> = {},
): ImportConfirmationPlan {
  const resolvedDuplicateActions: Record<number, DuplicateAction> = { ...duplicateActions };
  let createdPlayerCount = 0;
  let skippedPlayerCount = 0;
  for (const row of rows) {
    if (row.discarded) {
      skippedPlayerCount += 1;
      continue;
    }
    if (row.status === 'ERROR') continue;
    if (row.duplicateExisting || row.duplicateInFile) {
      const action = resolvedDuplicateActions[row.rowNumber] ?? 'SKIP';
      resolvedDuplicateActions[row.rowNumber] = action;
      if (action === 'SKIP') {
        skippedPlayerCount += 1;
      } else if (action === 'DISTINCT') {
        createdPlayerCount += 1;
      }
      continue;
    }
    createdPlayerCount += 1;
  }

  const createdTeamCount = teamResolutions.filter(
    (resolution) => resolution.action === 'CREATE' && !(tournamentStatus === 'RUNNING'),
  ).length;

  const underMinimumTeamCount = teamResolutions.filter((resolution) => {
    if (tournamentStatus === 'RUNNING' && resolution.existingTeamId === null) return false;

    const importedTeamCount = rows.filter(
      (row) =>
        !row.discarded &&
        row.status !== 'ERROR' &&
        row.normalizedTeamName &&
        normalizeTeamName(row.normalizedTeamName) === normalizeTeamName(resolution.incomingName) &&
        !(
          (row.duplicateExisting || row.duplicateInFile) &&
          (resolvedDuplicateActions[row.rowNumber] ?? 'SKIP') !== 'DISTINCT'
        ),
    ).length;
    const existingCount = resolution.existingTeamId
      ? (existingTeamCounts[resolution.existingTeamId] ?? 0)
      : 0;
    return existingCount + importedTeamCount < minimumRosterSize;
  }).length;

  return {
    teamResolutions,
    duplicateActions: resolvedDuplicateActions,
    createdPlayerCount,
    skippedPlayerCount,
    createdTeamCount,
    underMinimumTeamCount,
  };
}
