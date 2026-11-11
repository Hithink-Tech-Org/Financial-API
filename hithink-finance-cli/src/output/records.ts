import { externalize, renderJson, snakeCase } from './json.js';

/** Rows from one returned result; no pagination or recursive flattening. */
export function dataRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value !== null && typeof value === 'object' && 'item' in value && Array.isArray(value.item))
    return value.item;
  return [value];
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(externalize(value)) : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function* csvLines(value: unknown): Generator<string> {
  const rows = dataRows(value);
  if (rows.length === 0) return;
  const records = rows.every(
    (row) => row !== null && typeof row === 'object' && !Array.isArray(row),
  );
  if (!records) {
    yield 'value\n';
    for (const row of rows) yield `${csvCell(row)}\n`;
    return;
  }
  const fields = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row as object)) fields.add(key);
  const headers = [...fields];
  yield `${headers.map((header) => csvCell(snakeCase(header))).join(',')}\n`;
  for (const row of rows)
    yield `${headers.map((header) => csvCell((row as Record<string, unknown>)[header])).join(',')}\n`;
}

export function* recordLines(value: unknown, format: 'csv' | 'ndjson'): Generator<string> {
  if (format === 'csv') yield* csvLines(value);
  else for (const row of dataRows(value)) yield renderJson(row);
}
