import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  computeFormatOption,
  computeFormatOptions,
  getGroupCountAlternatives,
  getGroupSizes,
  validateFormatParams,
} from '../../domain/format-options';
import { FormatId, FormatOption, FormatParams, Tournament } from '../../domain/model';
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

  private readonly router = inject(Router);

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
    this.isSaving.set(true);
    try {
      await tournamentRepository.updateFormat(params);
      this.statusMessage.set(this.strings.saved);
      this.tournament.set({ ...tournament, formatParams: params });
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
