import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  ImportDelimiter,
  ImportEncoding,
  ImportPreview,
  readImportFile,
} from '../import/file-reader';
import { IMPORT_STRINGS } from '../i18n/import-strings';

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

  protected goBack(): void {
    void this.router.navigateByUrl('/panel');
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
    } catch (error) {
      this.preview.set(null);
      this.errorMessage.set(error instanceof Error ? error.message : IMPORT_STRINGS.readFailed);
    }
  }
}
