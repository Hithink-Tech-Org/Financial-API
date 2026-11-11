import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';

const names = [
  'shared',
  'symbol',
  'market',
  'special-data',
  'ipo',
  'news',
  'financials',
  'valuation',
  'index',
  'fund',
  'futures',
  'options',
  'data',
  'research',
].map((n) => `hithink-finance-${n}`);

test('ships exactly fourteen valid Skills with shared dependency rules', async () => {
  expect(names).toHaveLength(14);
  for (const name of names) {
    const file = path.resolve('skills', name, 'SKILL.md');
    await expect(access(file)).resolves.toBeUndefined();
    const text = await readFile(file, 'utf8');
    expect(text).toMatch(/^---\r?\nname:/u);
    expect(text).toContain('description:');
    if (name !== 'hithink-finance-shared') expect(text).toContain('hithink-finance-shared');
    expect(text).toContain('--format json');
  }
});

test('documents the persistent multi-Agent Skill lifecycle', async () => {
  const text = await readFile(
    path.resolve('skills', 'hithink-finance-shared', 'references', 'skills-management.md'),
    'utf8',
  );

  expect(text).toContain('WorkBuddy');
  expect(text).toContain('QClaw');
  expect(text).toContain('目录建立链接');
  expect(text).toContain('仅存在历史 `skills` 目录不算客户端证据');
  expect(text).toContain('sync --agent <name>');
});

test('routes remote authentication through the active credential and recommends OAuth', async () => {
  const shared = await readFile('skills/hithink-finance-shared/SKILL.md', 'utf8');
  expect(shared).toContain('默认推荐 OAuth');
  expect(shared).toContain('auth login --method oauth');
  expect(shared).toContain('当前启用的 OAuth 或 API Key');
  const catalog = JSON.parse(await readFile('schemas/capabilities.json', 'utf8')) as {
    capabilities: { id: string; source: string }[];
  };
  const manifest = JSON.parse(await readFile('skills/manifest.json', 'utf8')) as {
    files: Record<string, string>;
  };
  for (const capability of catalog.capabilities.filter((item) => item.source === 'remote')) {
    const reference = Object.keys(manifest.files).find((file) =>
      file.endsWith(`/references/${capability.id.replaceAll('.', '-')}.md`),
    );
    expect(reference, capability.id).toBeDefined();
    const text = await readFile(path.join('skills', reference!), 'utf8');
    expect(text, capability.id).toContain('OAuth');
    expect(text, capability.id).toContain('auth status');
    expect(text, capability.id).not.toContain('远端调用需要 API Key');
    expect(text, capability.id).not.toContain('先处理 API Key');
  }
});

test('global output guidance distinguishes auth status predicates from command errors', async () => {
  const text = await readFile('skills/hithink-finance-shared/references/global-rules.md', 'utf8');
  for (const expected of [
    'auth status',
    '退出 0',
    '退出 3',
    'ok=true',
    'data.connected',
    'stdout',
    'stderr',
  ])
    expect(text).toContain(expected);
});

test('bundled Skill metadata and supplemental routing work without the unified Skill', async () => {
  const shared = await readFile('skills/hithink-finance-shared/SKILL.md', 'utf8');
  expect(shared).toContain('description');
  const descriptions: string[] = [];
  for (const name of names) {
    const text = await readFile(path.join('skills', name, 'SKILL.md'), 'utf8');
    const description = text.match(/^description: (.+)$/mu)?.[1];
    expect(description, name).toBeDefined();
    expect(description, name).toContain('hithink-finance CLI');
    descriptions.push(description!);
    expect(text).not.toContain('../hithink-finance/SKILL.md');
    if (name !== 'hithink-finance-shared') {
      expect(shared).toContain(`[${name}](../${name}/SKILL.md)`);
      expect(text).not.toContain('首次使用本域');
    }
  }
  expect(new Set(descriptions).size).toBe(names.length);
});
