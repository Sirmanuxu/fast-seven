import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ImportEncoding = 'UTF-8' | 'Windows-1252' | 'ISO-8859-1';
export type ImportDelimiter = ',' | ';' | '\t';
export type ImportFormat = 'CSV' | 'EXCEL';

export interface ImportReadOptions {
  readonly encoding?: ImportEncoding;
  readonly delimiter?: ImportDelimiter;
  readonly sheetName?: string;
}

export interface ImportPreview {
  readonly fileName: string;
  readonly format: ImportFormat;
  readonly encoding: ImportEncoding | null;
  readonly delimiter: ImportDelimiter | null;
  readonly sheetNames: readonly string[];
  readonly selectedSheet: string | null;
  readonly headers: readonly string[];
  readonly previewRows: readonly (readonly string[])[];
  readonly rowCount: number;
  readonly warning: string | null;
}

function countDelimiterOutsideQuotes(text: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (const character of text) {
    if (character === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectCsvDelimiter(text: string): ImportDelimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates: readonly ImportDelimiter[] = [';', ',', '\t'];
  return candidates.reduce((best, candidate) =>
    countDelimiterOutsideQuotes(firstLine, candidate) > countDelimiterOutsideQuotes(firstLine, best)
      ? candidate
      : best,
  );
}

export function detectCsvEncoding(bytes: Uint8Array): ImportEncoding {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'UTF-8';
  }

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'UTF-8';
  } catch {
    return 'Windows-1252';
  }
}

function decodeCsv(bytes: Uint8Array, encoding: ImportEncoding): string {
  let input = bytes;
  if (
    encoding === 'UTF-8' &&
    input.length >= 3 &&
    input[0] === 0xef &&
    input[1] === 0xbb &&
    input[2] === 0xbf
  ) {
    input = input.slice(3);
  }

  if (encoding === 'UTF-8') {
    return new TextDecoder('utf-8', { fatal: false }).decode(input);
  }
  return new TextDecoder(encoding).decode(input);
}

function isEntireRowEmpty(row: readonly string[]): boolean {
  return row.every((value) => value.trim() === '');
}

async function readCsv(file: File, options: ImportReadOptions): Promise<ImportPreview> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding = options.encoding ?? detectCsvEncoding(bytes);
  const text = decodeCsv(bytes, encoding);
  const delimiter = options.delimiter ?? detectCsvDelimiter(text);
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: 'greedy',
  });
  const rows = parsed.data
    .map((row) => row.map((value) => String(value ?? '')))
    .filter((row) => !isEntireRowEmpty(row));

  if (rows.length === 0) {
    return {
      fileName: file.name,
      format: 'CSV',
      encoding,
      delimiter,
      sheetNames: [],
      selectedSheet: null,
      headers: [],
      previewRows: [],
      rowCount: 0,
      warning: 'El archivo está vacío.',
    };
  }

  const headers = rows[0];
  const hasHeaders = headers.some((header) => header.trim() !== '');
  if (!hasHeaders) {
    return {
      fileName: file.name,
      format: 'CSV',
      encoding,
      delimiter,
      sheetNames: [],
      selectedSheet: null,
      headers: [],
      previewRows: [],
      rowCount: 0,
      warning: 'El archivo no tiene encabezados.',
    };
  }

  const dataRows = rows.slice(1);
  const brokenCharacters = /�/.test(text);
  return {
    fileName: file.name,
    format: 'CSV',
    encoding,
    delimiter,
    sheetNames: [],
    selectedSheet: null,
    headers,
    previewRows: dataRows.slice(0, 5),
    rowCount: dataRows.length,
    warning:
      dataRows.length > 2000
        ? 'El archivo supera las 2000 filas.'
        : brokenCharacters
          ? 'Hay caracteres posiblemente mal decodificados. Probá otra codificación.'
          : null,
  };
}

async function readExcel(file: File, options: ImportReadOptions): Promise<ImportPreview> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellText: true,
  });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    return {
      fileName: file.name,
      format: 'EXCEL',
      encoding: null,
      delimiter: null,
      sheetNames: [],
      selectedSheet: null,
      headers: [],
      previewRows: [],
      rowCount: 0,
      warning: 'El archivo no contiene hojas.',
    };
  }

  const selectedSheet = options.sheetName ?? sheetNames[0];
  if (!workbook.Sheets[selectedSheet]) {
    return {
      fileName: file.name,
      format: 'EXCEL',
      encoding: null,
      delimiter: null,
      sheetNames,
      selectedSheet,
      headers: [],
      previewRows: [],
      rowCount: 0,
      warning: 'La hoja seleccionada no existe.',
    };
  }

  const matrix = XLSX.utils
    .sheet_to_json<unknown[]>(workbook.Sheets[selectedSheet], {
      header: 1,
      raw: false,
      defval: '',
    })
    .map((row) => row.map((value) => String(value ?? '')))
    .filter((row) => !isEntireRowEmpty(row));

  if (matrix.length === 0) {
    return {
      fileName: file.name,
      format: 'EXCEL',
      encoding: null,
      delimiter: null,
      sheetNames,
      selectedSheet,
      headers: [],
      previewRows: [],
      rowCount: 0,
      warning: 'La hoja seleccionada está vacía.',
    };
  }

  const headers = matrix[0];
  const dataRows = matrix.slice(1);
  return {
    fileName: file.name,
    format: 'EXCEL',
    encoding: null,
    delimiter: null,
    sheetNames,
    selectedSheet,
    headers,
    previewRows: dataRows.slice(0, 5),
    rowCount: dataRows.length,
    warning: dataRows.length > 2000 ? 'El archivo supera las 2000 filas.' : null,
  };
}

export async function readImportFile(
  file: File,
  options: ImportReadOptions = {},
): Promise<ImportPreview> {
  const extension = file.name.toLocaleLowerCase('es').split('.').pop();
  if (extension === 'csv') {
    return readCsv(file, options);
  }
  if (extension === 'xlsx' || extension === 'xls') {
    return readExcel(file, options);
  }
  throw new Error('Formato no admitido. Seleccioná un archivo CSV, XLSX o XLS.');
}
