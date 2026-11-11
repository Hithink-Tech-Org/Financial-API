import { expect, test } from 'vitest';
import { renderTable } from '../../src/output/table.js';

test('aligns Chinese, combining marks and emoji by terminal cells', () => {
  const text = renderTable(
    [
      { name: '茅台', value: 1 },
      { name: 'e\u0301🙂', value: 2 },
    ],
    80,
  );
  expect(text).toContain('茅台      1');
  expect(text).toContain('e\u0301🙂       2');
  expect(text).not.toContain('|');
});

test('wraps narrow records without losing fields or splitting graphemes', () => {
  const value = '超长字段👩‍💻e\u0301'.repeat(4);
  const text = renderTable([{ name: value, other: '保留' }], 16);
  expect(text).toContain('other');
  expect(text).toContain('保留');
  expect(text.replaceAll(/\s/gu, '')).toContain(value);
  expect(text.split('\n').every((line) => [...line].length <= 16)).toBe(true);
});

test('renders nested collections and empty values, neutralizing terminal controls', () => {
  const text = renderTable(
    { timestamp: 1, item: [{ name: '中文', tags: ['A', 'B'] }], empty: [], nil: null },
    40,
  );
  expect(text).toContain('timestamp');
  expect(text).toContain('中文');
  expect(text).toContain('(empty)');
  expect(text).toContain('null');
  expect(renderTable({})).toBe('(empty)\n');
  const clean = renderTable([{ name: '\u001b[31mred\nnext\u0007' }], 40);
  expect(clean).not.toContain('\u001b');
  expect(clean).not.toContain('\u0007');
});

test('wraps very long fields without exceeding the function argument limit', () => {
  const value = 'a'.repeat(2_000_000);
  const text = renderTable([{ text: value }], 16);
  expect(text.replaceAll(/\s/gu, '')).toBe(`text:${value}`);
});
