import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { writeDataFile } from '../../src/output/files.js';

test('row exports preserve all rows, strings, nesting and CSV quoting', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'finance-rows-'));
  const envelope = {
    ok: true,
    data: {
      timestamp: 1,
      item: [
        { code: '000001', name: '中,"文\n下一行', value: null, nested: { rawValue: -1.234567 } },
        { code: '000002', extra: true },
      ],
    },
  };
  try {
    const json = path.join(directory, 'response.json');
    await writeDataFile(json, envelope, 'json');
    expect(JSON.parse(await readFile(json, 'utf8'))).toMatchObject({
      ok: true,
      data: { timestamp: 1 },
    });
    const ndjson = path.join(directory, 'rows.ndjson');
    await writeDataFile(ndjson, envelope, 'ndjson');
    const rows = (await readFile(ndjson, 'utf8'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ code: '000001', nested: { raw_value: -1.234567 } });
    const csv = path.join(directory, 'rows.csv');
    await writeDataFile(csv, envelope, 'csv');
    const text = await readFile(csv, 'utf8');
    expect(text).toContain('code,name,value,nested,extra\n');
    expect(text).toContain('"中,""文\n下一行"');
    expect(text).toContain('000001');
    expect((await readdir(directory)).sort()).toEqual(['response.json', 'rows.csv', 'rows.ndjson']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed serialization and cancellation preserve an existing output file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'finance-export-failure-'));
  const target = path.join(directory, 'keep.ndjson');
  try {
    await writeFile(target, 'keep');
    await expect(writeDataFile(target, { data: [1n] }, 'ndjson')).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe('keep');
    const abort = new AbortController();
    abort.abort();
    await expect(
      writeDataFile(target, { data: [{ value: 1 }] }, 'ndjson', abort.signal),
    ).rejects.toThrow();
    expect(await readFile(target, 'utf8')).toBe('keep');
    expect(await readdir(directory)).toEqual(['keep.ndjson']);
    const active = new AbortController();
    const rows = [
      {
        get value() {
          active.abort();
          return 1;
        },
      },
    ];
    await expect(
      writeDataFile(target, { data: rows }, 'ndjson', active.signal),
    ).rejects.toMatchObject({ code: 'CLI_CANCELLED' });
    expect(await readFile(target, 'utf8')).toBe('keep');
    expect(await readdir(directory)).toEqual(['keep.ndjson']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
