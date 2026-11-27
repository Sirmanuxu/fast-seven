import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  computeFormatOption,
  computeFormatOptions,
  getGroupCountAlternatives,
  getGroupSizes,
  validateFormatParams,
} from '../../domain/format-options';
import {
  createGroupDrawPlan,
  groupsFromPlan,
  moveTeamBetweenGroups,
  GroupDrawPlan,
} from '../../domain/group-draw';
import { FormatId, FormatOption, FormatParams, Group, Team, Tournament } from '../../domain/model';
import { createSeededRng } from '../../domain/rng';
import { tournamentRepository } from '../../data/tournament-repository';
import { FORMAT_STRINGS } from '../../i18n/format-strings';
import { showErrorPopup } from '../error-popup';

@Component({
  selector: 'app-format',
  templateUrl: './format.component.html',
  styleUrl: './format.component.css',
})
export class FormatComponent implements OnInit {
  protected readonly strings = FORMAT_STRINGS;
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly teamCount = signal(0);
  protected readonly matchDuration = signal(40);
  protected readonly restDuration = signal(10);
  protected readonly selected = signal<FormatId | null>(null);
  protected readonly formatParams = signal<FormatParams | null>(null);
  protected readonly compared = signal<readonly FormatId[]>([]);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly isSaving = signal(false);
  protected readonly teams = signal<readonly Team[]>([]);
  protected readonly drawnGroups = signal<readonly Group[]>([]);
  protected readonly groupDrawPlan = signal<GroupDrawPlan | null>(null);
  protected readonly groupDrawBusy = signal(false);
  protected readonly groupStageId = signal<string | null>(null);
  protected readonly selectedMoveTeamId = signal('');
  protected readonly selectedSwapTeamId = signal('');
  protected readonly selectedMoveFrom = signal(0);
  protected readonly selectedMoveTo = signal(0);

  private readonly router = inject(Router);

  protected get formatLocked(): boolean {
    const status = this.tournament()?.status;
    return status === 'RUNNING' || status === 'FINISHED';
  }

  protected get options(): readonly FormatOption[] {
    const tournament = this.tournament();
    if (!tournament) return [];
    const schedule = {
      ...tournament.schedule,
      matchDurationMin: this.matchDuration(),
      restMin: this.restDuration(),
    };
    const catalog = computeFormatOptions(this.teamCount(), schedule);
    const params = this.formatParams();
    if (!params) return catalog;
    const custom = computeFormatOption(this.teamCount(), schedule, params);
    return catalog.map((option) => (option.format === params.format ? custom : option));
  }

  async ngOnInit(): Promise<void> {
    const tournament = await tournamentRepository.getTournament();
    if (!tournament) {
      await this.router.navigateByUrl('/bienvenida');
      return;
    }
    this.tournament.set(tournament);
    this.teamCount.set(await this.getTeamCount());
    this.teams.set(await tournamentRepository.getTeams());
    this.drawnGroups.set(await tournamentRepository.getGroups());
    this.groupStageId.set(this.drawnGroups()[0]?.stageId ?? null);
    this.matchDuration.set(tournament.schedule.matchDurationMin);
    this.restDuration.set(tournament.schedule.restMin);
    this.selected.set(tournament.formatParams?.format ?? null);
    this.formatParams.set(tournament.formatParams);
    this.rebuildComparison();
  }

  protected setTeamCount(value: string): void {
    const parsed = Number(value);
    this.teamCount.set(Number.isInteger(parsed) && parsed >= 0 ? parsed : 0);
    this.rebuildComparison();
  }

  protected setMatchDuration(value: string): void {
    const parsed = Number(value);
    this.matchDuration.set(Number.isInteger(parsed) && parsed >= 0 ? parsed : 0);
  }

  protected setRestDuration(value: string): void {
    const parsed = Number(value);
    this.restDuration.set(Number.isInteger(parsed) && parsed >= 0 ? parsed : 0);
  }

  protected toggleComparison(format: FormatId): void {
    const current = this.compared();
    if (current.includes(format)) {
      this.compared.set(current.filter((value) => value !== format));
      return;
    }
    if (current.length < 3) this.compared.set([...current, format]);
  }

  protected choose(option: FormatOption): void {
    if (option.viable && option.suggestedParams) {
      this.selected.set(option.format);
      this.formatParams.set(option.suggestedParams);
    }
  }

  protected setRoundCount(value: string): void {
    const params = this.formatParams();
    const rounds = Number(value);
    if (!params || !Number.isInteger(rounds)) return;
    if (params.format === 'ROUND_ROBIN')
      this.formatParams.set({ ...params, rounds: rounds === 2 ? 2 : 1 });
    if (params.format === 'SWISS') this.formatParams.set({ ...params, rounds });
  }

  protected setGroupCount(value: string): void {
    const params = this.formatParams();
    const groupCount = Number(value);
    if (!params || !Number.isInteger(groupCount)) return;
    if (
      params.format === 'GROUPS_KNOCKOUT' ||
      params.format === 'GROUPS_CUPS' ||
      params.format === 'GROUPS_POSITION_PLAYOFFS'
    )
      this.formatParams.set({ ...params, groupCount });
  }

  protected setQualifiers(value: string): void {
    const params = this.formatParams();
    const qualifiersPerGroup = Number(value);
    if (!params || params.format !== 'GROUPS_KNOCKOUT' || !Number.isInteger(qualifiersPerGroup))
      return;
    this.formatParams.set({ ...params, qualifiersPerGroup });
  }

  protected setThirdPlace(value: boolean): void {
    const params = this.formatParams();
    if (!params) return;
    if (params.format === 'GROUPS_KNOCKOUT')
      this.formatParams.set({ ...params, thirdPlaceMatch: value });
    if (params.format === 'GROUPS_CUPS')
      this.formatParams.set({ ...params, thirdPlaceMatch: value });
    if (params.format === 'KNOCKOUT') this.formatParams.set({ ...params, thirdPlaceMatch: value });
  }

  protected setGrandFinalReset(value: boolean): void {
    const params = this.formatParams();
    if (!params || params.format !== 'DOUBLE_ELIMINATION') return;
    this.formatParams.set({ ...params, grandFinalReset: value });
  }

  protected get parameterOption(): FormatOption | null {
    const tournament = this.tournament();
    const params = this.formatParams();
    if (!tournament || !params) return null;
    return computeFormatOption(
      this.teamCount(),
      {
        ...tournament.schedule,
        matchDurationMin: this.matchDuration(),
        restMin: this.restDuration(),
      },
      params,
    );
  }

  protected get parameterErrors(): readonly string[] {
    const params = this.formatParams();
    if (!params) return [];
    return validateFormatParams(this.teamCount(), params).map((error) =>
      this.message(error.messageKey, error.params),
    );
  }

  protected get groupAlternatives(): readonly number[] {
    return getGroupCountAlternatives(this.teamCount());
  }

  protected groupSizeText(groupCount: number): string {
    return getGroupSizes(this.teamCount(), groupCount).join('-');
  }

  protected formatLabel(format: FormatId): string {
    return this.strings.labels[format];
  }

  protected warningText(code: string, option: FormatOption): string {
    const warning = option.warnings.find((item) => item.code === code);
    if (!warning) return '';
    return this.message(warning.messageKey, warning.params);
  }

  protected reasonText(option: FormatOption): string {
    return option.notViableReasonKey ? this.message(option.notViableReasonKey) : '';
  }

  protected get groupDrawEnabled(): boolean {
    const format = this.formatParams()?.format;
    return (
      format === 'GROUPS_KNOCKOUT' ||
      format === 'GROUPS_CUPS' ||
      format === 'GROUPS_POSITION_PLAYOFFS'
    );
  }

  protected get canDrawGroups(): boolean {
    const status = this.tournament()?.status;
    return status === 'SETUP' || status === 'FIXTURE_GENERATED';
  }

  protected groupTeamName(teamId: string): string {
    return this.teams().find((team) => team.id === teamId)?.name ?? teamId;
  }

  protected groupName(index: number): string {
    return String.fromCharCode(65 + index);
  }

  protected groupExplanation(plan: GroupDrawPlan): string {
    const seeded = plan.explanation.seededTeamIds.map((id) => this.groupTeamName(id)).join(', ');
    const uneven = plan.explanation.uneven
      ? ` ${this.strings.groupUnevenExplanation.replace(
          '{groups}',
          plan.groupSizes.map((size, index) => `${this.groupName(index)}: ${size}`).join(', '),
        )}`
      : '';
    return `${this.strings.groupSeedExplanation}: ${seeded || this.strings.groupNoSeeds}.${uneven}`;
  }

  protected async previewGroupDraw(): Promise<void> {
    this.groupDrawPlan.set(null);
    if (!this.groupDrawEnabled || !this.canDrawGroups) {
      showErrorPopup(this.strings.groupDrawDisabled);
      return;
    }
    const params = this.formatParams();
    if (!params || !('groupCount' in params)) {
      showErrorPopup(this.strings.groupDrawInvalid);
      return;
    }
    const seed = crypto.randomUUID();
    const result = createGroupDrawPlan({
      teams: this.teams(),
      groupCount: params.groupCount,
      drawId: crypto.randomUUID(),
      seed,
      createdAt: new Date().toISOString(),
      rng: createSeededRng(seed),
    });
    if (!result.ok) {
      showErrorPopup(this.strings.groupDrawInvalid);
      return;
    }
    this.groupDrawPlan.set(result.value);
    this.selectedMoveFrom.set(0);
    this.selectedMoveTo.set(result.value.groupTeamIds.length > 1 ? 1 : 0);
    this.selectedMoveTeamId.set('');
    this.selectedSwapTeamId.set('');
  }

  protected movePreviewTeam(): void {
    const plan = this.groupDrawPlan();
    const teamId = this.selectedMoveTeamId();
    const swapTeamId = this.selectedSwapTeamId();
    if (!plan || !teamId || !swapTeamId) return;
    const result = moveTeamBetweenGroups(plan.groupTeamIds, plan.groupSizes, {
      teamId,
      swapTeamId,
      fromGroup: this.selectedMoveFrom(),
      toGroup: this.selectedMoveTo(),
    });
    if (!result.ok) {
      showErrorPopup(this.strings.groupMoveInvalid);
      return;
    }
    this.groupDrawPlan.set({
      ...plan,
      groupTeamIds: result.value,
      draw: { ...plan.draw, payload: { kind: 'GROUPS', groups: result.value } },
    });
    this.selectedMoveTeamId.set('');
    this.selectedSwapTeamId.set('');
  }

  protected moveTeamOptions(groupIndex: number): readonly string[] {
    return this.groupDrawPlan()?.groupTeamIds[groupIndex] ?? [];
  }

  protected setMoveFrom(value: string): void {
    const fromGroup = Number(value);
    this.selectedMoveFrom.set(fromGroup);
    if (fromGroup === this.selectedMoveTo()) {
      this.selectedMoveTo.set((fromGroup + 1) % (this.groupDrawPlan()?.groupTeamIds.length ?? 1));
    }
    this.selectedMoveTeamId.set('');
    this.selectedSwapTeamId.set('');
  }

  protected setMoveTo(value: string): void {
    const toGroup = Number(value);
    this.selectedMoveTo.set(toGroup);
    if (toGroup === this.selectedMoveFrom()) {
      this.selectedMoveFrom.set((toGroup + 1) % (this.groupDrawPlan()?.groupTeamIds.length ?? 1));
      this.selectedMoveTeamId.set('');
    }
    this.selectedSwapTeamId.set('');
  }

  protected async confirmGroupDraw(): Promise<void> {
    const plan = this.groupDrawPlan();
    const tournament = this.tournament();
    if (!plan || !tournament || this.groupDrawBusy()) return;
    this.groupDrawBusy.set(true);
    try {
      const stageId = this.groupStageId() ?? crypto.randomUUID();
      const existingGroupIds = this.drawnGroups().map((group) => group.id);
      const groupIds =
        existingGroupIds.length === plan.groupTeamIds.length
          ? existingGroupIds
          : plan.groupTeamIds.map(() => crypto.randomUUID());
      await tournamentRepository.saveGroupDraw({
        stage: {
          id: stageId,
          type: 'GROUPS',
          name: 'Grupos',
          order: 1,
          cup: null,
        },
        groups: groupsFromPlan(stageId, plan.groupTeamIds, groupIds),
        draw: plan.draw,
      });
      this.groupStageId.set(stageId);
      this.drawnGroups.set(groupsFromPlan(stageId, plan.groupTeamIds, groupIds));
      this.groupDrawPlan.set(null);
      this.statusMessage.set(this.strings.groupDrawSaved);
    } catch (error) {
      console.error('Group draw failed', error);
      showErrorPopup(this.strings.groupDrawFailed);
    } finally {
      this.groupDrawBusy.set(false);
    }
  }

  protected paramsText(params: FormatParams | null): string {
    if (!params) return '';
    if (params.format === 'ROUND_ROBIN') return `Vueltas: ${params.rounds}`;
    if (params.format === 'SWISS') return `Rondas: ${params.rounds}`;
    if (params.format === 'DOUBLE_ELIMINATION')
      return `Final con reinicio: ${params.grandFinalReset ? 'sí' : 'no'}`;
    if (params.format === 'GROUPS_KNOCKOUT') {
      return `Grupos: ${params.groupCount}; clasificados por grupo: ${params.qualifiersPerGroup}; 3er puesto: ${params.thirdPlaceMatch ? 'sí' : 'no'}`;
    }
    if (params.format === 'GROUPS_CUPS') {
      return `Grupos: ${params.groupCount}; 3er puesto de cada copa: ${params.thirdPlaceMatch ? 'sí' : 'no'}`;
    }
    if (params.format === 'GROUPS_POSITION_PLAYOFFS') return `Grupos: ${params.groupCount}`;
    return `3er puesto: ${params.thirdPlaceMatch ? 'sí' : 'no'}`;
  }

  protected findOption(format: FormatId): FormatOption | undefined {
    return this.options.find((option) => option.format === format);
  }

  protected formatDuration(totalMinutes: number): string {
    if (totalMinutes <= 60) return `${totalMinutes} ${this.strings.minutes}`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes === 0
      ? `${hours} ${this.strings.hours}`
      : `${hours} ${this.strings.hours} ${minutes} ${this.strings.minutes}`;
  }

  protected async save(): Promise<void> {
    const tournament = this.tournament();
    const params = this.formatParams();
    if (!tournament || !params || validateFormatParams(this.teamCount(), params).length > 0) return;
    const format = this.options.find((option) => option.format === params.format && option.viable);
    if (!format) return;
    const formatChanged =
      tournament.formatParams !== null &&
      JSON.stringify(tournament.formatParams) !== JSON.stringify(params);
    if (
      tournament.status === 'FIXTURE_GENERATED' &&
      formatChanged &&
      !window.confirm(this.strings.fixtureResetConfirmation)
    ) {
      return;
    }
    this.isSaving.set(true);
    try {
      await tournamentRepository.updateFormat(params, {
        matchDurationMin: this.matchDuration(),
        restMin: this.restDuration(),
      });
      const updatedTournament = await tournamentRepository.getTournament();
      this.tournament.set(updatedTournament);
      this.teams.set(await tournamentRepository.getTeams());
      this.drawnGroups.set(await tournamentRepository.getGroups());
      this.groupStageId.set(this.drawnGroups()[0]?.stageId ?? null);
      this.statusMessage.set(formatChanged ? this.strings.fixtureReset : this.strings.saved);
    } catch {
      showErrorPopup(this.strings.saveFailed);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
  }

  private async getTeamCount(): Promise<number> {
    return (await tournamentRepository.getTeams()).length;
  }

  private rebuildComparison(): void {
    const viable = this.options.filter((option) => option.viable).map((option) => option.format);
    this.compared.set(
      this.compared()
        .filter((format) => viable.includes(format))
        .slice(0, 3),
    );
  }

  private message(key: string, params?: Readonly<Record<string, string | number>>): string {
    const rawMessage = this.strings[key];
    let message = typeof rawMessage === 'string' ? rawMessage : key;
    for (const [name, value] of Object.entries(params ?? {})) {
      message = message.replace(`{${name}}`, String(value));
    }
    return message;
  }
}
