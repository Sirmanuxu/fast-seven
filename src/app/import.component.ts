import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ImportDelimiter,
  ImportEncoding,
  ImportPreview,
  readImportFile,
} from '../import/file-reader';
import { IMPORT_STRINGS } from '../i18n/import-strings';
import {
  FullNameSplitMode,
  ImportColumnMapping,
  ImportMappedField,
  EMPTY_IMPORT_MAPPING,
  getMissingRequiredMappings,
  mappingSignature,
  splitFullName,
  suggestColumnMapping,
} from '../import/column-mapping';

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

    return preview.rows.slice(0, 5).map((row) => {
      const fullName =
        fullIndex >= 0 ? (row[fullIndex] ?? '').trim() : '';
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
    const rows =
      'Juan;Pérez;M16;M;Los Teros\r\nLucía;Fernández;M16;F;';
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
      localStorage.setItem(
        this.rememberedMappingKey,
        JSON.stringify(mapping),
      );
    }
  }

  private async readFile(file: File): Promise<void> {
    this.selectedFile = file;
    this.errorMessage.set(null);
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
      this.setupMapping(preview);
    } catch (error) {
      this.preview.set(null);
      this.errorMessage.set(error instanceof Error ? error.message : IMPORT_STRINGS.readFailed);
    }
  }
}
