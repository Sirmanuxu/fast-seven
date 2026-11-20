import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tournamentRepository } from '../data/tournament-repository';
import { Player, Team, Tournament } from '../domain/model';
import { getTeamRosterStatus } from '../domain/team-assignment';
import { TEAM_ASSIGNMENT_STRINGS } from '../i18n/team-assignment-strings';

@Component({
  selector: 'app-team-assignment',
  templateUrl: './team-assignment.component.html',
  styleUrl: './team-assignment.component.css',
})
export class TeamAssignmentComponent implements OnInit {
  private readonly router = inject(Router);

  protected readonly strings = TEAM_ASSIGNMENT_STRINGS;
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly players = signal<readonly Player[]>([]);
  protected readonly teams = signal<readonly Team[]>([]);
  protected readonly selectedTeamId = signal<string | null>(null);
  protected readonly unassignedSelectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly teamSelectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly statusMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected get unassignedPlayers(): readonly Player[] {
    return this.players().filter((player) => player.teamId === null);
  }

  protected get selectedTeamPlayers(): readonly Player[] {
    const teamId = this.selectedTeamId();
    return teamId ? this.players().filter((player) => player.teamId === teamId) : [];
  }

  protected get selectedTeam(): Team | null {
    const teamId = this.selectedTeamId();
    return teamId ? (this.teams().find((team) => team.id === teamId) ?? null) : null;
  }

  protected get rosterStatus(): string {
    const tournament = this.tournament();
    const teamId = this.selectedTeamId();
    if (!tournament || !teamId) {
      return '';
    }
    const status = getTeamRosterStatus(this.players(), teamId, tournament.rules.roster);
    if (status.state === 'BELOW_MINIMUM') {
      return `${status.count}: ${TEAM_ASSIGNMENT_STRINGS.rosterBelow}`;
    }
    if (status.state === 'ABOVE_MAXIMUM') {
      return `${status.count}: ${TEAM_ASSIGNMENT_STRINGS.rosterAbove}`;
    }
    return `${status.count}: ${TEAM_ASSIGNMENT_STRINGS.rosterOk}`;
  }

  protected selectTeam(teamId: string): void {
    this.selectedTeamId.set(teamId || null);
    this.teamSelectedIds.set(new Set());
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
      this.statusMessage.set(TEAM_ASSIGNMENT_STRINGS.noTeamSelected);
      return;
    }
    await this.movePlayers([...this.unassignedSelectedIds()], teamId);
  }

  protected async moveSelectedToUnassigned(): Promise<void> {
    await this.movePlayers([...this.teamSelectedIds()], null);
  }

  protected playerName(player: Player): string {
    return `${player.firstName} ${player.lastName}${player.disambiguation ?? ''}`;
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
  }

  private async movePlayers(
    playerIds: readonly string[],
    destinationTeamId: string | null,
  ): Promise<void> {
    if (playerIds.length === 0) {
      this.statusMessage.set(TEAM_ASSIGNMENT_STRINGS.noSelection);
      return;
    }

    try {
      const captainClearedTeamIds = await tournamentRepository.assignPlayers(
        playerIds,
        destinationTeamId,
      );
      await this.load();
      this.unassignedSelectedIds.set(new Set());
      this.teamSelectedIds.set(new Set());
      this.statusMessage.set(
        captainClearedTeamIds.length > 0
          ? TEAM_ASSIGNMENT_STRINGS.captainCleared
          : TEAM_ASSIGNMENT_STRINGS.moveDone,
      );
    } catch {
      this.statusMessage.set(TEAM_ASSIGNMENT_STRINGS.moveFailed);
    }
  }

  private async load(): Promise<void> {
    this.tournament.set(await tournamentRepository.getTournament());
    this.players.set(await tournamentRepository.getPlayers());
    this.teams.set(await tournamentRepository.getTeams());
  }
}
