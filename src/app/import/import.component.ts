import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ImportDelimiter,
  ImportEncoding,
  ImportPreview,
  readImportFile,
} from '../../import/file-reader';
import { IMPORT_STRINGS } from '../../i18n/import-strings';
import {
  FullNameSplitMode,
  ImportColumnMapping,
  ImportMappedField,
  EMPTY_IMPORT_MAPPING,
  getMissingRequiredMappings,
  mappingSignature,
  splitFullName,
  suggestColumnMapping,
} from '../../import/column-mapping';
import { tournamentRepository } from '../../data/tournament-repository';
import { Category, Player, Team } from '../../domain/model';
import { buildImportPreview, ImportPreviewRow, MappedImportRow } from '../../import/import-preview';

@Component({
  selector: 'app-import',
  templateUrl: './import.component.html',
  styleUrl: './import.component.css',
})
export class ImportComponent {
  private readonly router = inject(Router);
  private selectedFile: File | null = null;

  protected readonly strings = IMPORT_STRINGS;
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly encoding = signal<ImportEncoding | ''>('');
  protected readonly delimiter = signal<ImportDelimiter | ''>('');
  protected readonly sheetName = signal('');
  protected readonly mapping = signal<ImportColumnMapping>(EMPTY_IMPORT_MAPPING);
  protected readonly step = signal<'FILE' | 'MAPPING' | 'REVIEW'>('FILE');
  protected readonly mappingConfirmed = signal(false);
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly reviewRows = signal<readonly ImportPreviewRow[]>([]);
  protected readonly statusFilter = signal<'ALL' | 'OK' | 'WARNING' | 'ERROR'>('ALL');
  private existingPlayers: readonly Player[] = [];
  private existingTeams: readonly Team[] = [];
  private catalog: readonly Category[] = [];
  private rememberedMappingKey = '';

  protected async onFileInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.errorMessage.set(IMPORT_STRINGS.emptyDrop);
      return;
    }
    await this.readFile(file);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      this.errorMessage.set(IMPORT_STRINGS.emptyDrop);
      return;
    }
    await this.readFile(file);
  }

  protected preventDrop(event: DragEvent): void {
    event.preventDefault();
  }

  protected async reread(): Promise<void> {
    if (!this.selectedFile) {
      return;
    }
    await this.readFile(this.selectedFile);
  }

  protected async onEncodingChange(event: Event): Promise<void> {
    this.encoding.set((event.target as HTMLSelectElement).value as ImportEncoding);
  }

  protected async onDelimiterChange(event: Event): Promise<void> {
    this.delimiter.set((event.target as HTMLSelectElement).value as ImportDelimiter);
  }

  protected async onSheetChange(event: Event): Promise<void> {
    this.sheetName.set((event.target as HTMLSelectElement).value);
    await this.reread();
  }

  protected setMappingField(field: ImportMappedField, event: Event): void {
    const value = (event.target as HTMLSelectElement).value || null;
    const current = this.mapping();
    const next = { ...current, [field]: value } as ImportColumnMapping;
    this.mapping.set(next);
    this.rememberMapping(next);
  }

  protected setFullName(event: Event): void {
    const value = (event.target as HTMLSelectElement).value || null;
    this.mapping.set({
      ...this.mapping(),
      fullName: value,
      splitMode: value ? 'COMMA' : 'NONE',
    });
    this.rememberMapping(this.mapping());
  }

  protected setSplitMode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as FullNameSplitMode;
    this.mapping.set({ ...this.mapping(), splitMode: value });
    this.rememberMapping(this.mapping());
  }

  protected get missingMappings(): readonly string[] {
    return getMissingRequiredMappings(this.mapping());
  }

  protected get mappedPreviewRows(): readonly {
    readonly firstName: string;
    readonly lastName: string;
    readonly category: string;
    readonly gender: string;
    readonly team: string;
  }[] {
    const preview = this.preview();
    if (!preview) {
      return [];
    }
    const mapping = this.mapping();
    const index = (header: string | null): number =>
      header ? preview.headers.indexOf(header) : -1;
    const firstIndex = index(mapping.firstName);
    const lastIndex = index(mapping.lastName);
    const fullIndex = index(mapping.fullName);
    const categoryIndex = index(mapping.category);
    const genderIndex = index(mapping.gender);
    const teamIndex = index(mapping.team);

    return preview.rows.map((row) => {
      const fullName = fullIndex >= 0 ? (row[fullIndex] ?? '').trim() : '';
      const split = fullName
        ? splitFullName(fullName, mapping.splitMode)
        : {
            firstName: firstIndex >= 0 ? (row[firstIndex] ?? '').trim() : '',
            lastName: lastIndex >= 0 ? (row[lastIndex] ?? '').trim() : '',
          };
      return {
        firstName: split.firstName,
        lastName: split.lastName,
        category: categoryIndex >= 0 ? (row[categoryIndex] ?? '').trim() : '',
        gender: genderIndex >= 0 ? (row[genderIndex] ?? '').trim() : '',
        team: teamIndex >= 0 ? (row[teamIndex] ?? '').trim() : '',
      };
    });
  }

  protected downloadTemplate(): void {
    const headers = 'Nombre;Apellido;Categoria;Genero;Equipo';
    const rows = 'Juan;Pérez;M16;M;Los Teros\r\nLucía;Fernández;M16;F;';
    const blob = new Blob(['\uFEFF', `${headers}\r\n${rows}`], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-jugadores.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  protected continueToMapping(): void {
    if (!this.preview()) {
      this.statusMessage.set('Primero cargá un archivo.');
      return;
    }
    this.step.set('MAPPING');
    this.statusMessage.set(null);
  }

  protected backToFile(): void {
    this.step.set('FILE');
    this.mappingConfirmed.set(false);
  }

  protected async confirmMapping(): Promise<void> {
    if (this.missingMappings.length > 0) {
      this.statusMessage.set(
        `${IMPORT_STRINGS.missingMapping}: ${this.missingMappings.join(', ')}`,
      );
      return;
    }
    this.rememberMapping(this.mapping());
    this.mappingConfirmed.set(true);
    await this.buildReview();
  }

  protected get reviewStatusCounts(): {
    readonly total: number;
    readonly ok: number;
    readonly warning: number;
    readonly error: number;
  } {
    const rows = this.reviewRows();
    return {
      total: rows.length,
      ok: rows.filter((row) => row.status === 'OK').length,
      warning: rows.filter((row) => row.status === 'WARNING').length,
      error: rows.filter((row) => row.status === 'ERROR').length,
    };
  }

  protected get filteredReviewRows(): readonly ImportPreviewRow[] {
    const filter = this.statusFilter();
    return filter === 'ALL'
      ? this.reviewRows()
      : this.reviewRows().filter((row) => row.status === filter);
  }

  protected setStatusFilter(event: Event): void {
    this.statusFilter.set(
      (event.target as HTMLSelectElement).value as 'ALL' | 'OK' | 'WARNING' | 'ERROR',
    );
  }

  protected editReviewRow(
    rowNumber: number,
    field: 'firstName' | 'lastName' | 'categoryRaw' | 'genderRaw' | 'teamNameRaw',
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement).value;
    const rows = this.reviewRows().map((row) =>
      row.rowNumber === rowNumber ? { ...row, [field]: value } : row,
    );
    this.revalidateReview(rows);
  }

  protected toggleDiscard(rowNumber: number): void {
    const rows = this.reviewRows().map((row) =>
      row.rowNumber === rowNumber ? { ...row, discarded: !row.discarded } : row,
    );
    this.reviewRows.set(rows);
  }

  protected toggleDifferentPerson(rowNumber: number): void {
    const rows = this.reviewRows().map((row) =>
      row.rowNumber === rowNumber
        ? {
            ...row,
            differentPerson: !row.differentPerson,
            discarded: row.differentPerson ? false : false,
          }
        : row,
    );
    this.revalidateReview(rows);
  }

  protected async addUnknownCategory(rowNumber: number): Promise<void> {
    const row = this.reviewRows().find((item) => item.rowNumber === rowNumber);
    if (!row) return;
    const label = window.prompt('Ingresá el nombre visible de la categoría:', row.categoryRaw);
    if (!label?.trim()) return;
    try {
      await tournamentRepository.addTournamentCategory(label);
      await this.buildReview();
      this.statusMessage.set(`Categoría agregada: ${label.trim()}`);
    } catch (error) {
      console.error('Category creation failed', error);
      this.statusMessage.set('No se pudo agregar la categoría.');
    }
  }

  protected issueLabel(row: ImportPreviewRow): string {
    if (row.status === 'ERROR') {
      return row.issues
        .map((issue) => {
          if (issue.code === 'MISSING_PLAYER_FIELD') return this.strings.issueMissingField;
          if (issue.code === 'UNKNOWN_CATEGORY') return this.strings.issueUnknownCategory;
          if (issue.code === 'UNKNOWN_GENDER') return this.strings.issueUnknownGender;
          if (issue.code === 'NEW_TEAM') return this.strings.issueTeamNew;
          if (issue.code === 'SIMILAR_TEAM') return this.strings.issueTeamSimilar;
          if (issue.code === 'DUPLICATE_EXISTING_PLAYER')
            return this.strings.issueDuplicateExisting;
          if (issue.code === 'DUPLICATE_IN_FILE') return this.strings.issueDuplicateInFile;
          return this.strings.issueGeneric;
        })
        .join('. ');
    }
    if (row.status === 'WARNING') {
      const labels: string[] = [];
      if (row.duplicateExisting) labels.push(this.strings.issueDuplicateExisting);
      if (row.duplicateInFile) labels.push(this.strings.issueDuplicateInFile);
      if (row.teamIsNew) labels.push(this.strings.issueTeamNew);
      if (row.teamIsSimilar) labels.push(this.strings.issueTeamSimilar);
      return labels.join('. ');
    }
    return 'OK';
  }

  protected get hasReviewErrors(): boolean {
    return this.reviewRows().some((row) => !row.discarded && row.status === 'ERROR');
  }

  protected backToMapping(): void {
    this.step.set('MAPPING');
    this.mappingConfirmed.set(false);
  }

  protected confirmImportPreview(): void {
    if (this.hasReviewErrors) {
      this.statusMessage.set(this.strings.reviewResolveErrors);
      return;
    }
    this.statusMessage.set('Revisión completa. La escritura confirmada se realizará en HU-11.');
  }

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
  }

  private setupMapping(preview: ImportPreview): void {
    const suggested = suggestColumnMapping(preview.headers);
    const signature = mappingSignature(preview.headers);
    this.rememberedMappingKey = `fast-seven-import-mapping:${signature}`;
    const saved = localStorage.getItem(this.rememberedMappingKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<ImportColumnMapping>;
        const restored: ImportColumnMapping = {
          firstName: parsed.firstName ?? null,
          lastName: parsed.lastName ?? null,
          category: parsed.category ?? null,
          gender: parsed.gender ?? null,
          team: parsed.team ?? null,
          fullName: parsed.fullName ?? null,
          splitMode: parsed.splitMode ?? 'NONE',
        };
        this.mapping.set(restored);
        return;
      } catch {
        localStorage.removeItem(this.rememberedMappingKey);
      }
    }
    this.mapping.set(suggested);
  }

  private rememberMapping(mapping: ImportColumnMapping): void {
    if (this.rememberedMappingKey) {
      localStorage.setItem(this.rememberedMappingKey, JSON.stringify(mapping));
    }
  }

  private async buildReview(): Promise<void> {
    this.existingPlayers = await tournamentRepository.getPlayers();
    this.existingTeams = await tournamentRepository.getTeams();
    const preview = this.preview();
    if (!preview) {
      return;
    }
    const tournament = await tournamentRepository.getTournament();
    const catalog = tournament?.categories ?? [];
    this.catalog = catalog;
    const mapped = this.mappedPreviewRows.map((row) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      categoryRaw: row.category,
      genderRaw: row.gender,
      teamNameRaw: row.team,
    }));
    this.reviewRows.set(
      buildImportPreview(mapped, catalog, this.existingPlayers, this.existingTeams),
    );
    this.statusFilter.set('ALL');
    this.statusMessage.set('Revisión completa. Corregí filas con error antes de continuar.');
    this.step.set('REVIEW');
  }

  private revalidateReview(rows: readonly ImportPreviewRow[]): void {
    const mapped: readonly MappedImportRow[] = rows.map((row) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      categoryRaw: row.categoryRaw,
      genderRaw: row.genderRaw,
      teamNameRaw: row.teamNameRaw,
    }));
    const revalidated = buildImportPreview(
      mapped,
      this.catalog,
      this.existingPlayers,
      this.existingTeams,
    );
    const preserved = revalidated.map((row) => {
      const previous = rows.find((item) => item.rowNumber === row.rowNumber);
      return {
        ...row,
        discarded: previous?.discarded ?? row.discarded,
        differentPerson: previous?.differentPerson ?? row.differentPerson,
      };
    });
    this.reviewRows.set(preserved);
  }

  private async readFile(file: File): Promise<void> {
    this.selectedFile = file;
    this.errorMessage.set(null);
    this.step.set('FILE');
    this.mappingConfirmed.set(false);
    this.statusMessage.set(null);
    try {
      const preview = await readImportFile(file, {
        encoding: this.encoding() || undefined,
        delimiter: this.delimiter() || undefined,
        sheetName: this.sheetName() || undefined,
      });
      this.preview.set(preview);
      this.sheetName.set(preview.selectedSheet ?? '');
      this.encoding.set(preview.encoding ?? '');
      this.delimiter.set(preview.delimiter ?? '');
      this.setupMapping(preview);
    } catch (error) {
      this.preview.set(null);
      this.errorMessage.set(error instanceof Error ? error.message : IMPORT_STRINGS.readFailed);
    }
  }
}
