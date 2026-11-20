import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentRepository } from '../../data/tournament-repository';
import { Player, Team, Tournament } from '../../domain/model';
import {
  areTeamColorsTooSimilar,
  canCreateOrDeleteTeam,
  getDefaultTeamColorPair,
  getRosterStatus,
  hasMixedRoster,
  validateTeamInput,
} from '../../domain/team';
import { createTeamDrawPlan, TeamDrawPlan } from '../../domain/team-draw';
import { createSeededRng } from '../../domain/rng';
import { TEAM_STRINGS } from '../../i18n/team-strings';

@Component({
  selector: 'app-teams',
  templateUrl: './teams.component.html',
  styleUrl: './teams.component.css',
})
export class TeamsComponent implements OnInit {
  private readonly router = inject(Router);

  protected readonly strings = TEAM_STRINGS;
  protected readonly teams = signal<readonly Team[]>([]);
  protected readonly players = signal<readonly Player[]>([]);
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly primaryColor = signal('#1f4b99');
  protected readonly secondaryColor = signal('#f1c40f');
  protected readonly captainId = signal<string | null>(null);
  protected readonly isSeed = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly selectedTeamId = signal<string | null>(null);
  protected readonly unassignedSelectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly teamSelectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly drawNewTeamCount = signal(1);
  protected readonly drawBalance = signal(false);
  protected readonly drawSelectedExistingIds = signal<ReadonlySet<string>>(new Set());
  protected readonly drawPlan = signal<TeamDrawPlan | null>(null);
  protected readonly drawError = signal<string | null>(null);
  protected readonly drawBusy = signal(false);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async load(): Promise<void> {
    this.tournament.set(await tournamentRepository.getTournament());
    this.teams.set(await tournamentRepository.getTeams());
    this.players.set(await tournamentRepository.getPlayers());
  }

  protected get canCreateOrDelete(): boolean {
    return this.tournament() ? canCreateOrDeleteTeam(this.tournament()?.status ?? 'SETUP') : false;
  }

  protected openAdd(): void {
    if (!this.canCreateOrDelete) {
      this.statusMessage.set(TEAM_STRINGS.runningCreateDelete);
      return;
    }
    const colors = getDefaultTeamColorPair(this.teams());
    this.editingId.set(null);
    this.name.set('');
    this.primaryColor.set(colors.primary);
    this.secondaryColor.set(colors.secondary);
    this.captainId.set(null);
    this.isSeed.set(false);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(team: Team): void {
    this.editingId.set(team.id);
    this.name.set(team.name);
    this.primaryColor.set(team.primaryColor);
    this.secondaryColor.set(team.secondaryColor);
    this.captainId.set(team.captainId);
    this.isSeed.set(team.isSeed);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  protected get unassignedPlayers(): readonly Player[] {
    return this.players().filter((player) => player.teamId === null);
  }

  protected get selectedTeamPlayers(): readonly Player[] {
    const teamId = this.selectedTeamId();
    return teamId ? this.players().filter((player) => player.teamId === teamId) : [];
  }

  protected toggleUnassigned(playerId: string): void {
    const next = new Set(this.unassignedSelectedIds());
    if (next.has(playerId)) {
      next.delete(playerId);
    } else {
      next.add(playerId);
    }
    this.unassignedSelectedIds.set(next);
  }

  protected toggleTeamPlayer(playerId: string): void {
    const next = new Set(this.teamSelectedIds());
    if (next.has(playerId)) {
      next.delete(playerId);
    } else {
      next.add(playerId);
    }
    this.teamSelectedIds.set(next);
  }

  protected isUnassignedSelected(playerId: string): boolean {
    return this.unassignedSelectedIds().has(playerId);
  }

  protected isTeamPlayerSelected(playerId: string): boolean {
    return this.teamSelectedIds().has(playerId);
  }

  protected async moveSelectedToTeam(): Promise<void> {
    const teamId = this.selectedTeamId();
    if (!teamId) {
      this.statusMessage.set('Seleccioná un equipo.');
      window.alert('Seleccioná un equipo antes de asignar jugadores.');
      return;
    }
    await this.movePlayers([...this.unassignedSelectedIds()], teamId);
  }

  protected async moveSelectedToUnassigned(): Promise<void> {
    const teamId = this.selectedTeamId();
    if (!teamId) {
      this.statusMessage.set('Seleccioná un equipo.');
      return;
    }
    await this.movePlayers([...this.teamSelectedIds()], null);
  }

  private async movePlayers(
    playerIds: readonly string[],
    destinationTeamId: string | null,
  ): Promise<void> {
    if (playerIds.length === 0) {
      this.statusMessage.set(TEAM_STRINGS.noSelection);
      window.alert(TEAM_STRINGS.noSelection);
      return;
    }

    const captainIsMoving = this.teams().some(
      (team) =>
        team.captainId !== null &&
        playerIds.includes(team.captainId) &&
        team.id !== destinationTeamId,
    );
    if (captainIsMoving && !window.confirm(TEAM_STRINGS.captainMoveWarning)) {
      return;
    }

    try {
      await tournamentRepository.assignPlayers(playerIds, destinationTeamId);
      await this.load();
      this.unassignedSelectedIds.set(new Set());
      this.teamSelectedIds.set(new Set());

      if (destinationTeamId) {
        const remainingPlayers = this.players();
        if (hasMixedRoster(remainingPlayers, destinationTeamId)) {
          window.confirm(TEAM_STRINGS.mixedConfirmation);
        }
        const limits = this.tournament()?.rules.roster;
        if (limits) {
          const status = getRosterStatus(remainingPlayers, destinationTeamId, limits);
          if (status.state !== 'OK') {
            window.confirm(TEAM_STRINGS.rosterWarning);
          }
        }
      }

      this.statusMessage.set(TEAM_STRINGS.assignmentDone);
    } catch (error) {
      console.error('Player assignment failed', error);
      this.statusMessage.set(TEAM_STRINGS.saveFailed);
      window.alert(TEAM_STRINGS.saveFailed);
    }
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  protected selectTeam(teamId: string): void {
    this.selectedTeamId.set(teamId || null);
    this.teamSelectedIds.set(new Set());
  }

  protected get canDraw(): boolean {
    return this.tournament()?.status !== 'RUNNING';
  }

  protected toggleDrawExistingTeam(teamId: string): void {
    const next = new Set(this.drawSelectedExistingIds());
    if (next.has(teamId)) {
      next.delete(teamId);
    } else {
      next.add(teamId);
    }
    this.drawSelectedExistingIds.set(next);
    this.drawPlan.set(null);
    this.drawError.set(null);
  }

  protected async previewDraw(): Promise<void> {
    this.drawError.set(null);
    this.drawPlan.set(null);
    if (!this.canDraw) {
      this.drawError.set(TEAM_STRINGS.drawDisabledRunning);
      return;
    }
    if (this.unassignedPlayers.length === 0) {
      this.drawError.set(TEAM_STRINGS.drawNoPlayers);
      return;
    }
    const newTeamCount = Math.trunc(this.drawNewTeamCount());
    if (!Number.isInteger(newTeamCount) || newTeamCount < 0) {
      this.drawError.set(TEAM_STRINGS.drawInvalidCount);
      return;
    }

    const selectedExistingIds = this.drawSelectedExistingIds();
    if (newTeamCount === 0 && selectedExistingIds.size === 0) {
      this.drawError.set(TEAM_STRINGS.drawInvalidCount);
      return;
    }
    const existingTargets = this.teams()
      .filter((team) => selectedExistingIds.has(team.id))
      .map((team) => ({
        id: team.id,
        currentPlayerCount: this.teamPlayers(team).length,
      }));
    const newTargets = Array.from({ length: newTeamCount }, (_, index) => ({
      id: `new-team-${index}`,
      currentPlayerCount: 0,
    }));
    const tournament = this.tournament();
    if (!tournament) {
      this.drawError.set(TEAM_STRINGS.drawFailed);
      return;
    }

    const seed = crypto.randomUUID();
    const result = createTeamDrawPlan({
      players: this.unassignedPlayers,
      targets: [...existingTargets, ...newTargets],
      roster: tournament.rules.roster,
      balanceByCategoryGender: this.drawBalance(),
      drawId: crypto.randomUUID(),
      seed,
      createdAt: new Date().toISOString(),
      rng: createSeededRng(seed),
    });
    if (!result.ok) {
      this.drawError.set(this.drawErrorMessage(result.error.code, result.error.params));
      return;
    }
    this.drawPlan.set(result.value);
  }

  protected async confirmDraw(): Promise<void> {
    const plan = this.drawPlan();
    if (!plan || this.drawBusy()) {
      return;
    }
    this.drawBusy.set(true);
    try {
      const newAssignments = plan.assignments.filter((assignment) =>
        assignment.targetId.startsWith('new-team-'),
      );
      const singleCategory =
        new Set(
          this.unassignedPlayers
            .filter((player) =>
              newAssignments.some((assignment) => assignment.playerIds.includes(player.id)),
            )
            .map((player) => player.category),
        ).size === 1;
      const category = singleCategory
        ? this.unassignedPlayers.find((player) =>
            newAssignments.some((assignment) => assignment.playerIds.includes(player.id)),
          )?.category
        : null;
      const newTeams = newAssignments.map((assignment, index) => {
        const id = crypto.randomUUID();
        const colors = getDefaultTeamColorPair(this.teams(), index);
        return {
          targetId: assignment.targetId,
          team: {
            id,
            name: category
              ? `${category} ${String.fromCharCode(65 + index)}`
              : `Equipo ${index + 1}`,
            primaryColor: colors.primary,
            secondaryColor: colors.secondary,
            captainId: null,
            logo: null,
            isSeed: false,
            status: 'ACTIVE' as const,
          },
        };
      });
      const replacementIds = new Map(
        newTeams.map(({ targetId, team }) => [targetId, team.id] as const),
      );
      const assignments = plan.assignments.map((assignment) => ({
        targetId: replacementIds.get(assignment.targetId) ?? assignment.targetId,
        playerIds: assignment.playerIds,
      }));
      await tournamentRepository.applyTeamDraw({
        assignments,
        newTeams: newTeams.map(({ team }) => team),
        draw: {
          ...plan.draw,
          payload: {
            kind: 'TEAMS',
            teams: assignments.map((assignment) => assignment.playerIds),
          },
        },
      });
      await this.load();
      this.drawPlan.set(null);
      this.drawSelectedExistingIds.set(new Set());
      this.drawNewTeamCount.set(1);
      this.statusMessage.set(TEAM_STRINGS.drawSaved);
    } catch (error) {
      console.error('Team draw failed', error);
      this.drawError.set(TEAM_STRINGS.drawFailed);
    } finally {
      this.drawBusy.set(false);
    }
  }

  protected cancelDraw(): void {
    this.drawPlan.set(null);
    this.drawError.set(null);
  }

  protected drawPlayers(assignment: {
    readonly targetId: string;
    readonly playerIds: readonly string[];
  }): readonly Player[] {
    return assignment.playerIds
      .map((playerId) => this.players().find((player) => player.id === playerId))
      .filter((player): player is Player => player !== undefined);
  }

  protected drawTargetName(targetId: string): string {
    if (targetId.startsWith('new-team-')) {
      const index = Number.parseInt(targetId.replace('new-team-', ''), 10);
      return `Equipo ${index + 1}`;
    }
    return this.teams().find((team) => team.id === targetId)?.name ?? targetId;
  }

  private drawErrorMessage(
    code: string,
    params?: Readonly<Record<string, string | number>>,
  ): string {
    if (code === 'notEnoughPlayers') {
      return TEAM_STRINGS.drawNotEnoughPlayers.replace(
        '{maximum}',
        String(params?.['maximumPossible'] ?? 0),
      );
    }
    if (code === 'tooManyPlayers') {
      return TEAM_STRINGS.drawTooManyPlayers;
    }
    return TEAM_STRINGS.drawFailed;
  }

  protected async saveTeam(): Promise<void> {
    const existing = this.editingId()
      ? (this.teams().find((team) => team.id === this.editingId()) ?? null)
      : null;

    const validation = validateTeamInput({
      name: this.name(),
      primaryColor: this.primaryColor(),
      secondaryColor: this.secondaryColor(),
      captainId: this.captainId(),
      teamId: existing?.id ?? null,
      players: this.players(),
      teams: this.teams(),
    });
    if (!validation.ok) {
      this.formError.set(validation.error.message);
      return;
    }

    if (!existing && !this.canCreateOrDelete) {
      this.formError.set(TEAM_STRINGS.runningCreateDelete);
      return;
    }

    if (this.colorsWarning() && !window.confirm(TEAM_STRINGS.similarColors)) {
      return;
    }

    const team: Team = {
      id: existing?.id ?? crypto.randomUUID(),
      name: validation.name,
      primaryColor: this.primaryColor(),
      secondaryColor: this.secondaryColor(),
      captainId: this.captainId(),
      logo: existing?.logo ?? null,
      isSeed: this.isSeed(),
      status: existing?.status ?? 'ACTIVE',
    };

    try {
      await tournamentRepository.putTeam(team);
      await this.load();
      this.closeForm();
      this.statusMessage.set(null);
    } catch {
      this.formError.set(TEAM_STRINGS.saveFailed);
    }
  }

  protected async deleteTeam(team: Team): Promise<void> {
    if (!this.canCreateOrDelete) {
      this.statusMessage.set(TEAM_STRINGS.runningCreateDelete);
      return;
    }

    const fixtureWarning =
      this.tournament()?.status === 'FIXTURE_GENERATED' ? ` ${TEAM_STRINGS.fixtureDelete}` : '';
    const confirmed = window.confirm(`${TEAM_STRINGS.deleteQuestion}${fixtureWarning}`);
    if (!confirmed) {
      return;
    }

    try {
      await tournamentRepository.deleteTeam(team.id);
      await this.load();
      this.statusMessage.set(
        this.tournament()?.status === 'FIXTURE_GENERATED' ? TEAM_STRINGS.fixtureDelete : null,
      );
    } catch (error) {
      console.error('Team deletion failed', error);
      this.statusMessage.set(TEAM_STRINGS.deleteFailed);
    }
  }

  protected rosterStatus(team: Team): string {
    const limits = this.tournament()?.rules.roster;
    if (!limits) {
      return '';
    }
    const status = getRosterStatus(this.players(), team.id, limits);
    if (status.state === 'BELOW_MINIMUM') {
      return `${status.count} ${TEAM_STRINGS.players}: ${TEAM_STRINGS.belowMinimum}`;
    }
    if (status.state === 'ABOVE_MAXIMUM') {
      return `${status.count} ${TEAM_STRINGS.players}: ${TEAM_STRINGS.aboveMaximum}`;
    }
    return `${status.count} ${TEAM_STRINGS.players}: ${TEAM_STRINGS.rosterOk}`;
  }

  protected rosterLabel(team: Team): 'rojo' | 'amarillo' | 'verde' {
    const limits = this.tournament()?.rules.roster;
    return limits ? getRosterStatus(this.players(), team.id, limits).label : 'verde';
  }

  protected teamPlayers(team: Team): readonly Player[] {
    return this.players().filter((player) => player.teamId === team.id);
  }

  protected captainOptions(teamId: string | null): readonly Player[] {
    return teamId ? this.players().filter((player) => player.teamId === teamId) : [];
  }

  protected isMixed(team: Team): boolean {
    return hasMixedRoster(this.players(), team.id);
  }

  protected colorsWarning(): boolean {
    return areTeamColorsTooSimilar(this.primaryColor(), this.secondaryColor());
  }

  protected playerName(player: Player): string {
    return `${player.firstName} ${player.lastName}${player.disambiguation ?? ''}`;
  }

  protected captainName(team: Team): string {
    if (!team.captainId) {
      return TEAM_STRINGS.noCaptain;
    }
    const captain = this.teamPlayers(team).find((player) => player.id === team.captainId);
    return captain ? this.playerName(captain) : TEAM_STRINGS.noCaptain;
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
  }
}
