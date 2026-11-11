import { stripVTControlCharacters } from 'node:util';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function clean(value: string): string {
  return stripVTControlCharacters(value).replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ');
}

function cellWidth(cluster: string): number {
  if (/^[\p{Mark}\p{Cf}]*$/u.test(cluster)) return 0;
  if (/\p{Emoji_Presentation}|\uFE0F/u.test(cluster)) return 2;
  const cp = cluster.codePointAt(0) ?? 0;
  return cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff01 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1b000 && cp <= 0x1b2ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd))
    ? 2
    : 1;
}

function width(text: string): number {
  let result = 0;
  for (const { segment } of segmenter.segment(text)) result += cellWidth(segment);
  return result;
}

function wrap(text: string, columns: number): string[] {
  const lines: string[] = [];
  let line = '',
    used = 0;
  for (const { segment } of segmenter.segment(text)) {
    const size = cellWidth(segment);
    if (used + size > columns && line) {
      lines.push(line);
      line = '';
      used = 0;
    }
    line += segment;
    used += size;
  }
  lines.push(line);
  return lines;
}

function cell(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'number') {
    const text = String(value);
    if (text.includes('e')) return text;
    const [integer, fraction] = text.split('.');
    return (
      (integer ?? '').replace(/\B(?=(\d{3})+(?!\d))/gu, ',') +
      (fraction === undefined ? '' : `.${fraction}`)
    );
  }
  return clean(value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value));
}

function rowsToTable(
  headers: string[],
  rows: string[][],
  columns: number,
  numeric: boolean[] = [],
): string {
  const widths = headers.map((header) => width(header));
  for (const row of rows)
    row.forEach((entry, index) => {
      widths[index] = Math.max(widths[index] ?? 0, width(entry));
    });
  if (widths.reduce((sum, size) => sum + size, 0) + 2 * (headers.length - 1) > columns) {
    return (
      rows
        .map((row, index) => {
          const lines = rows.length > 1 ? [`[${index + 1}]`] : [];
          headers.forEach((header, i) => {
            for (const line of wrap(`${header}:`, columns)) lines.push(line);
            for (const line of wrap(row[i] ?? '—', Math.max(2, columns - 2)))
              lines.push(`  ${line}`);
          });
          return lines.join('\n');
        })
        .join('\n\n') + '\n'
    );
  }
  const renderRow = (row: string[], header = false) =>
    row
      .map((entry, index) => {
        const padding = ' '.repeat(Math.max(0, (widths[index] ?? 0) - width(entry)));
        return numeric[index] && !header ? padding + entry : entry + padding;
      })
      .join('  ')
      .trimEnd();
  return (
    [
      renderRow(headers, true),
      widths.map((size) => '─'.repeat(size)).join('  '),
      ...rows.map((row) => renderRow(row)),
    ].join('\n') + '\n'
  );
}

/** Compact terminal tables; wide records wrap without dropping data. */
export function renderTable(value: unknown, terminalColumns = 80, maxRows = 0): string {
  const columns = Number.isFinite(terminalColumns) ? Math.max(4, Math.floor(terminalColumns)) : 80;
  if (Array.isArray(value)) {
    if (maxRows > 0 && value.length > maxRows)
      return (
        renderTable(value.slice(0, maxRows), columns) +
        renderTable(
          `Showing ${maxRows} of ${value.length}; --max-rows 0 for all returned rows.`,
          columns,
        )
      );
    if (value.length === 0) return '(empty)\n';
    if (
      value.every((entry) => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
    ) {
      const records = value as Array<Record<string, unknown>>;
      const keys = [...new Set(records.flatMap((record) => Object.keys(record)))];
      if (keys.length === 0) return '(empty)\n';
      return rowsToTable(
        keys.map(clean),
        records.map((record) => keys.map((key) => cell(record[key]))),
        columns,
        keys.map(
          (key) =>
            records.some((record) => typeof record[key] === 'number') &&
            records.every(
              (record) =>
                record[key] === null ||
                record[key] === undefined ||
                typeof record[key] === 'number',
            ),
        ),
      );
    }
    return rowsToTable(
      ['value'],
      value.map((entry) => [cell(entry)]),
      columns,
    );
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '(empty)\n';
    const simple = entries.filter(([, entry]) => entry === null || typeof entry !== 'object');
    const nested = entries.filter(([, entry]) => entry !== null && typeof entry === 'object');
    const blocks = simple.length
      ? [
          rowsToTable(
            ['key', 'value'],
            simple.map(([key, entry]) => [clean(key), cell(entry)]),
            columns,
          ),
        ]
      : [];
    for (const [key, entry] of nested)
      blocks.push(
        `${wrap(`${clean(key)}:`, columns).join('\n')}\n${renderTable(entry, columns, maxRows)}`,
      );
    return blocks.join('\n');
  }
  return wrap(cell(value), columns).join('\n') + '\n';
}
