import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { buildSkillManifest } from '../../src/infrastructure/skills/manifest.js';
import {
  readSkillsLifecycleStatus,
  removeLifecycleSkills,
  syncLifecycleSkills,
  type SkillsLifecyclePaths,
} from '../../src/infrastructure/skills/lifecycle.js';

const roots: string[] = [];
vi.mock('node:fs/promises', async (load) => {
  const actual = await load<typeof import('node:fs/promises')>();
  return { ...actual, symlink: vi.fn(actual.symlink), unlink: vi.fn(actual.unlink) };
});

async function fixture(): Promise<{
  packageRoot: string;
  paths: SkillsLifecyclePaths;
  home: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'hithink-skills-lifecycle-'));
  roots.push(root);
  const packageRoot = path.join(root, 'package');
  const source = path.join(packageRoot, 'skills');
  await mkdir(path.join(source, 'hithink-finance-test'), { recursive: true });
  await writeFile(path.join(source, 'hithink-finance-test', 'SKILL.md'), 'official-v1');
  const manifest = await buildSkillManifest(source, '0.1.0');
  await writeFile(path.join(source, 'manifest.json'), JSON.stringify(manifest));
  return {
    packageRoot,
    home: path.join(root, 'home'),
    paths: {
      configDir: path.join(root, 'config'),
      dataDir: path.join(root, 'data'),
      stateDir: path.join(root, 'state'),
    },
  };
}
beforeEach(() => vi.stubEnv('DSH_HOME', undefined));
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function addFixtureSkills(packageRoot: string, ...names: string[]): Promise<void> {
  const source = path.join(packageRoot, 'skills');
  for (const name of names) {
    const directory = path.join(source, name);
    await mkdir(directory);
    await writeFile(path.join(directory, 'SKILL.md'), name);
  }
  const manifestFile = path.join(source, 'manifest.json');
  await rm(manifestFile);
  await writeFile(manifestFile, JSON.stringify(await buildSkillManifest(source, '0.2.0')));
}

test('auto mode does not mistake a historical Skills-only directory for an installed Agent', async () => {
  const value = await fixture();
  await mkdir(path.join(value.home, '.codex', 'skills'), { recursive: true });
  const result = await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home });
  expect(result.targets).toEqual([]);
  await expect(
    access(path.join(value.home, '.codex', 'skills', 'hithink-finance-test')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

test('auto detects an initialized DSH home and preserves an existing auto strategy', async () => {
  const value = await fixture();
  vi.stubEnv('DSH_HOME', ' ');
  const skills = path.join(value.home, '.dsh', 'skills');
  const marker = path.join(value.home, '.dsh', 'profiles');
  await mkdir(skills, { recursive: true });
  await mkdir(value.paths.configDir, { recursive: true });
  await writeFile(
    path.join(value.paths.configDir, 'skills-targets.json'),
    JSON.stringify({ version: 1, mode: 'auto', explicit: [], excluded: ['codex'], targets: {} }),
  );
  expect(
    (await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home })).targets,
  ).toEqual([]);

  await mkdir(marker);
  const result = await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home });
  expect(result.targets).toEqual([
    { name: 'dsh', directory: skills, delivery: 'link', status: 'ready' },
  ]);
  const deployed = path.join(skills, 'hithink-finance-test');
  expect((await lstat(deployed)).isSymbolicLink()).toBe(true);
  expect(await readFile(path.join(deployed, 'SKILL.md'), 'utf8')).toBe('official-v1');
  expect(
    (await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home)).strategy.excluded,
  ).toEqual(['codex']);
  await rm(deployed, { recursive: true });
  expect(
    (await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home)).targets[0]
      ?.status,
  ).toBe('missing');
  expect(
    (await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home })).failures,
  ).toEqual([]);
  expect(await readFile(path.join(deployed, 'SKILL.md'), 'utf8')).toBe('official-v1');
});

test('syncs DSH homes independently and removes only previously managed files', async () => {
  const value = await fixture();
  const root = await realpath(path.dirname(value.home));
  const first = path.join(root, 'first', 'skills');
  const second = path.join(root, 'second', 'skills');
  const ownSkill = path.join(second, 'hithink-finance-test');
  const unrelated = path.join(second, 'user-skill.md');
  const options = { homeDir: value.home, agents: ['dsh' as const] };

  vi.stubEnv('DSH_HOME', path.dirname(first));
  expect(
    (await syncLifecycleSkills(value.packageRoot, value.paths, { ...options, copy: true }))
      .failures,
  ).toEqual([]);

  vi.stubEnv('DSH_HOME', path.dirname(second));
  await mkdir(ownSkill, { recursive: true });
  await writeFile(path.join(ownSkill, 'SKILL.md'), 'user content');
  await writeFile(unrelated, 'unrelated');
  expect((await syncLifecycleSkills(value.packageRoot, value.paths, options)).failures).toEqual([
    expect.objectContaining({ name: 'dsh', directory: second, status: 'conflict' }),
  ]);
  expect(await readFile(path.join(ownSkill, 'SKILL.md'), 'utf8')).toBe('user content');
  await rm(ownSkill, { recursive: true });
  expect((await syncLifecycleSkills(value.packageRoot, value.paths, options)).failures).toEqual([]);

  const status = await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home);
  expect(status.targets).toEqual([
    { name: 'dsh', directory: first, delivery: 'copy', status: 'ready' },
    { name: 'dsh', directory: second, delivery: 'copy', status: 'ready' },
  ]);
  vi.stubEnv('DSH_HOME', path.join(root, 'unused'));
  expect(await removeLifecycleSkills(value.packageRoot, value.paths, options)).toEqual({
    removed: ['dsh'],
    failures: [],
  });
  await expect(access(path.join(first, 'hithink-finance-test'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await expect(access(ownSkill)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(unrelated, 'utf8')).toBe('unrelated');
});

test('DSH uses a stored explicit Skills directory in preference to DSH_HOME', async () => {
  const value = await fixture();
  const root = await realpath(path.dirname(value.home));
  const directory = path.join(root, 'shared-agents', 'skills');
  vi.stubEnv('DSH_HOME', path.join(root, 'dsh-runtime'));
  const result = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['dsh'],
    directory,
  });
  expect(result.targets).toEqual([{ name: 'dsh', directory, delivery: 'link', status: 'ready' }]);
  vi.stubEnv('DSH_HOME', path.join(root, 'another-dsh-runtime'));
  expect(
    (await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home })).targets,
  ).toEqual(result.targets);
});

test('preflights every DSH Skill before creating links in another home', async () => {
  const value = await fixture();
  const root = await realpath(path.dirname(value.home));
  const first = path.join(root, 'first', 'skills');
  const second = path.join(root, 'second', 'skills');
  const userSkill = path.join(second, 'hithink-finance-z-blocked');
  const options = { homeDir: value.home, agents: ['dsh' as const] };
  await addFixtureSkills(value.packageRoot, 'hithink-finance-z-blocked');
  vi.stubEnv('DSH_HOME', path.dirname(first));
  expect((await syncLifecycleSkills(value.packageRoot, value.paths, options)).failures).toEqual([]);

  vi.stubEnv('DSH_HOME', path.dirname(second));
  await mkdir(userSkill, { recursive: true });
  await writeFile(path.join(userSkill, 'SKILL.md'), 'user content');
  expect((await syncLifecycleSkills(value.packageRoot, value.paths, options)).failures).toEqual([
    expect.objectContaining({ name: 'dsh', directory: second, status: 'conflict' }),
  ]);
  await expect(lstat(path.join(second, 'hithink-finance-test'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(await readFile(path.join(first, 'hithink-finance-test', 'SKILL.md'), 'utf8')).toBe(
    'official-v1',
  );
  expect((await removeLifecycleSkills(value.packageRoot, value.paths, options)).removed).toEqual([
    'dsh',
  ]);
  await expect(lstat(path.join(first, 'hithink-finance-test'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(await readFile(path.join(userSkill, 'SKILL.md'), 'utf8')).toBe('user content');
});

test('rolls back newly linked Skills on an I/O failure without rebuilding existing links', async () => {
  const value = await fixture();
  const options = { homeDir: value.home, agents: ['dsh' as const] };
  const directory = path.join(value.home, '.dsh', 'skills');
  const existing = path.join(directory, 'hithink-finance-test');
  const added = path.join(directory, 'hithink-finance-z-added');
  const blocked = path.join(directory, 'hithink-finance-z-blocked');
  expect((await syncLifecycleSkills(value.packageRoot, value.paths, options)).failures).toEqual([]);
  await addFixtureSkills(value.packageRoot, 'hithink-finance-z-added', 'hithink-finance-z-blocked');
  vi.mocked(symlink).mockClear();
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  vi.mocked(symlink)
    .mockImplementationOnce(fs.symlink)
    .mockRejectedValueOnce(new Error('injected link write failure'));

  expect((await syncLifecycleSkills(value.packageRoot, value.paths, options)).failures).toEqual([
    expect.objectContaining({ directory, status: 'failed', detail: 'injected link write failure' }),
  ]);
  expect(vi.mocked(symlink).mock.calls.map(([, destination]) => destination)).toEqual([
    added,
    blocked,
  ]);
  await expect(lstat(added)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(path.join(existing, 'SKILL.md'), 'utf8')).toBe('official-v1');
  expect((await removeLifecycleSkills(value.packageRoot, value.paths, options)).removed).toEqual([
    'dsh',
  ]);
  await expect(lstat(existing)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('records only the managed links left after an interrupted rollback in a second DSH home', async () => {
  const value = await fixture();
  const root = await realpath(path.dirname(value.home));
  const first = path.join(root, 'first', 'skills');
  const second = path.join(root, 'second', 'skills');
  const retainedLink = path.join(second, 'hithink-finance-test');
  const userSkill = path.join(second, 'hithink-finance-z-blocked', 'SKILL.md');
  const options = { homeDir: value.home, agents: ['dsh' as const] };
  await addFixtureSkills(value.packageRoot, 'hithink-finance-z-blocked');
  vi.stubEnv('DSH_HOME', path.dirname(first));
  expect((await syncLifecycleSkills(value.packageRoot, value.paths, options)).failures).toEqual([]);

  vi.stubEnv('DSH_HOME', path.dirname(second));
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  vi.mocked(symlink)
    .mockImplementationOnce(fs.symlink)
    .mockImplementationOnce(async () => {
      await mkdir(path.dirname(userSkill));
      await writeFile(userSkill, 'user content');
      throw new Error('injected link write failure');
    });
  vi.mocked(unlink).mockRejectedValueOnce(new Error('injected rollback failure'));

  expect((await syncLifecycleSkills(value.packageRoot, value.paths, options)).failures).toEqual([
    expect.objectContaining({
      directory: second,
      status: 'failed',
      detail: expect.stringContaining('Could not roll back managed links: hithink-finance-test'),
    }),
  ]);
  expect((await lstat(retainedLink)).isSymbolicLink()).toBe(true);
  expect(
    (await syncLifecycleSkills(value.packageRoot, value.paths, { ...options, copy: true }))
      .failures,
  ).toEqual([expect.objectContaining({ directory: second, status: 'conflict' })]);

  expect(await removeLifecycleSkills(value.packageRoot, value.paths, options)).toEqual({
    removed: ['dsh'],
    failures: [],
  });
  await expect(lstat(path.join(first, 'hithink-finance-test'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await expect(lstat(retainedLink)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await readFile(userSkill, 'utf8')).toBe('user content');
});

test('persists explicit targets, appends later Agents, and shares one linked content copy', async () => {
  const value = await fixture();
  const first = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['codex'],
  });
  expect(first.targets.map((target) => target.name)).toEqual(['codex']);
  const second = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['claude-code'],
  });
  expect(second.targets.map((target) => target.name)).toEqual(
    expect.arrayContaining(['codex', 'claude-code']),
  );
  for (const agent of ['.codex', '.claude']) {
    const target = path.join(value.home, agent, 'skills', 'hithink-finance-test');
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
    expect(await readFile(path.join(target, 'SKILL.md'), 'utf8')).toBe('official-v1');
  }
  const status = await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home);
  expect(status.strategy).toMatchObject({ mode: 'auto', explicit: ['codex', 'claude-code'] });
  expect(status).toMatchObject({ targetsVerified: true, targetStatus: 'ready' });
  expect(status.targets.every((target) => target.status === 'ready')).toBe(true);
  const source = path.join(value.packageRoot, 'skills');
  await writeFile(path.join(source, 'hithink-finance-test', 'SKILL.md'), 'official-v2');
  await rm(path.join(source, 'manifest.json'));
  await writeFile(
    path.join(source, 'manifest.json'),
    JSON.stringify(await buildSkillManifest(source, '0.2.0')),
  );
  expect(
    (await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home })).failures,
  ).toEqual([]);
  for (const agent of ['.codex', '.claude']) {
    const target = path.join(value.home, agent, 'skills', 'hithink-finance-test');
    expect((await lstat(target)).isSymbolicLink()).toBe(true);
    expect(await readFile(path.join(target, 'SKILL.md'), 'utf8')).toBe('official-v2');
  }
});

test('repairs a broken link and preserves a selected copy delivery mode', async () => {
  const value = await fixture();
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
    copy: true,
  });
  const copy = path.join(value.home, '.workbuddy', 'skills', 'hithink-finance-test', 'SKILL.md');
  expect((await lstat(path.dirname(copy))).isSymbolicLink()).toBe(false);
  await writeFile(copy, 'damaged');
  await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home });
  expect(await readFile(copy, 'utf8')).toBe('official-v1');

  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['qclaw'],
  });
  const link = path.join(value.home, '.qclaw', 'skills', 'hithink-finance-test');
  await rm(link, { recursive: true, force: true });
  await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home });
  expect((await lstat(link)).isSymbolicLink()).toBe(true);
});

test('converts owned links to copies and keeps upgrades local to the bundled package', async () => {
  const value = await fixture();
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
  });
  const target = path.join(value.home, '.workbuddy', 'skills', 'hithink-finance-test');
  expect((await lstat(target)).isSymbolicLink()).toBe(true);
  const copied = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
    copy: true,
  });
  expect(copied.failures).toEqual([]);
  expect((await lstat(target)).isSymbolicLink()).toBe(false);
  const source = path.join(value.packageRoot, 'skills');
  await writeFile(path.join(source, 'hithink-finance-test', 'SKILL.md'), 'official-v2');
  await rm(path.join(source, 'manifest.json'));
  await writeFile(
    path.join(source, 'manifest.json'),
    JSON.stringify(await buildSkillManifest(source, '0.2.0')),
  );
  const upgraded = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
  });
  expect(upgraded.failures).toEqual([]);
  expect(await readFile(path.join(target, 'SKILL.md'), 'utf8')).toBe('official-v2');
});

test('a foreign link blocks copy conversion before any owned link is removed', async () => {
  const value = await fixture();
  const source = path.join(value.packageRoot, 'skills');
  await mkdir(path.join(source, 'hithink-finance-other'));
  await writeFile(path.join(source, 'hithink-finance-other', 'SKILL.md'), 'other');
  await rm(path.join(source, 'manifest.json'));
  await writeFile(
    path.join(source, 'manifest.json'),
    JSON.stringify(await buildSkillManifest(source, '0.1.0')),
  );
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
  });
  const directory = path.join(value.home, '.workbuddy', 'skills');
  const outside = path.join(value.home, 'user-skill');
  await mkdir(outside);
  await writeFile(path.join(outside, 'SKILL.md'), 'user');
  await rm(path.join(directory, 'hithink-finance-test'), { recursive: true });
  await symlink(
    outside,
    path.join(directory, 'hithink-finance-test'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const result = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
    copy: true,
  });
  expect(result.failures).toHaveLength(1);
  expect((await lstat(path.join(directory, 'hithink-finance-other'))).isSymbolicLink()).toBe(true);
  expect(await readFile(path.join(outside, 'SKILL.md'), 'utf8')).toBe('user');
  const status = await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home);
  expect(status.targets[0]?.delivery).toBe('link');
});

test('removing one target excludes it from automatic discovery without removing another target', async () => {
  const value = await fixture();
  await mkdir(path.join(value.home, '.workbuddy', 'settings'), { recursive: true });
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['codex'],
  });
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
  });
  const result = await removeLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['codex'],
  });
  expect(result.removed).toEqual(['codex']);
  await expect(
    access(path.join(value.home, '.codex', 'skills', 'hithink-finance-test')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
  expect(
    await access(path.join(value.home, '.workbuddy', 'skills', 'hithink-finance-test', 'SKILL.md')),
  ).toBeUndefined();
  const status = await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home);
  expect(status.strategy.excluded).toContain('codex');
});

test('migrates an unchanged legacy WorkBuddy copy to a managed shared link', async () => {
  const value = await fixture();
  const source = path.join(value.packageRoot, 'skills');
  const client = path.join(value.home, '.workbuddy');
  const target = path.join(client, 'skills');
  const legacy = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
  await cp(path.join(source, 'hithink-finance-test'), path.join(target, 'hithink-finance-test'), {
    recursive: true,
  });
  await writeFile(
    path.join(client, '.hithink-finance-cli-skills-manifest.json'),
    JSON.stringify(legacy),
  );

  const result = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
  });

  expect(result.failures).toEqual([]);
  expect((await lstat(path.join(target, 'hithink-finance-test'))).isSymbolicLink()).toBe(true);
  await expect(
    access(path.join(client, '.hithink-finance-cli-skills-manifest.json')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
});

test('keeps the prior shared content available when a new package tree fails manifest validation', async () => {
  const value = await fixture();
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['codex'],
  });
  await writeFile(
    path.join(value.packageRoot, 'skills', 'hithink-finance-test', 'SKILL.md'),
    'incomplete-next',
  );

  await expect(
    syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home }),
  ).rejects.toThrow('Skills content does not match');
  expect(
    await readFile(
      path.join(value.paths.dataDir, 'skills', 'current', 'hithink-finance-test', 'SKILL.md'),
      'utf8',
    ),
  ).toBe('official-v1');
});

test('keeps a disabled strategy disabled for lifecycle synchronization and removes all auto-managed targets', async () => {
  const value = await fixture();
  await mkdir(path.join(value.home, '.workbuddy', 'settings'), { recursive: true });
  await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home });
  const result = await removeLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
  });
  expect(result.removed).toEqual(['workbuddy']);
  await expect(
    access(path.join(value.home, '.workbuddy', 'skills', 'hithink-finance-test')),
  ).rejects.toMatchObject({ code: 'ENOENT' });

  const upgrade = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    reactivate: false,
  });
  expect(upgrade.targets).toEqual([]);
  expect(
    (await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home)).strategy.mode,
  ).toBe('disabled');

  const manual = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    reactivate: true,
  });
  expect(manual.failures).toEqual([]);
  expect(manual.targets.map((target) => target.name)).toEqual(['workbuddy']);
  expect(
    (await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home)).strategy,
  ).toMatchObject({ mode: 'auto', excluded: [] });
});

test('keeps auto mode while appending an explicit target and retains both managed targets for remove-all', async () => {
  const value = await fixture();
  await mkdir(path.join(value.home, '.workbuddy', 'settings'), { recursive: true });
  await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home });
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['codex'],
  });

  const status = await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home);
  expect(status.strategy).toMatchObject({ mode: 'auto', explicit: ['codex'] });
  expect(status.targets.map((target) => target.name)).toEqual(
    expect.arrayContaining(['codex', 'workbuddy']),
  );
  expect(
    (await removeLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home })).removed,
  ).toEqual(expect.arrayContaining(['codex', 'workbuddy']));
});

test('refuses an unknown copy target and reports a link ownership conflict in status', async () => {
  const value = await fixture();
  const skill = path.join(value.home, '.workbuddy', 'skills', 'hithink-finance-test');
  await mkdir(skill, { recursive: true });
  await writeFile(path.join(skill, 'SKILL.md'), 'user-owned');

  const copy = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
    copy: true,
  });
  expect(copy.failures[0]).toMatchObject({ status: 'conflict' });
  expect(await readFile(path.join(skill, 'SKILL.md'), 'utf8')).toBe('user-owned');

  await rm(skill, { recursive: true, force: true });
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['codex'],
  });
  const link = path.join(value.home, '.codex', 'skills', 'hithink-finance-test');
  await rm(link, { recursive: true, force: true });
  await mkdir(link, { recursive: true });
  const status = await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home);
  expect(status.targets.find((target) => target.name === 'codex')).toMatchObject({
    status: 'conflict',
    detail: expect.stringContaining('Expected a managed directory link'),
  });
});

test('refuses a nested link in a previously managed copy target', async () => {
  const value = await fixture();
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
    copy: true,
  });
  const target = path.join(value.home, '.workbuddy', 'skills', 'hithink-finance-test');
  const outside = path.join(value.home, 'outside', 'hithink-finance-test');
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, 'SKILL.md'), 'outside');
  await rm(target, { recursive: true, force: true });
  await symlink(outside, target, process.platform === 'win32' ? 'junction' : 'dir');

  const result = await syncLifecycleSkills(value.packageRoot, value.paths, { homeDir: value.home });
  expect(result.failures[0]).toMatchObject({ name: 'workbuddy', status: 'failed' });
  expect(await readFile(path.join(outside, 'SKILL.md'), 'utf8')).toBe('outside');
  expect(
    (await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home)).targets.find(
      (targetStatus) => targetStatus.name === 'workbuddy',
    ),
  ).toMatchObject({ status: 'conflict' });
});

test('refuses to create a copy target through a linked Agent root', async () => {
  const value = await fixture();
  const outside = path.join(value.home, 'outside-workbuddy');
  await mkdir(outside, { recursive: true });
  await symlink(
    outside,
    path.join(value.home, '.workbuddy'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  const result = await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
    copy: true,
  });
  expect(result.failures[0]).toMatchObject({
    name: 'workbuddy',
    status: 'failed',
    detail: expect.stringContaining('symbolic link'),
  });
  await expect(access(path.join(outside, 'skills'))).rejects.toMatchObject({ code: 'ENOENT' });
});

test('reports a conflict when a managed link was replaced before removal', async () => {
  const value = await fixture();
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['codex'],
  });
  const skill = path.join(value.home, '.codex', 'skills', 'hithink-finance-test');
  await rm(skill, { recursive: true, force: true });
  await mkdir(skill, { recursive: true });
  await writeFile(path.join(skill, 'SKILL.md'), 'user-owned');

  const result = await removeLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['codex'],
  });
  expect(result.removed).toEqual([]);
  expect(result.failures[0]).toMatchObject({ name: 'codex', status: 'conflict' });
  const status = await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home);
  expect(status.strategy.excluded).not.toContain('codex');
  expect(status.targets.find((target) => target.name === 'codex')).toMatchObject({
    status: 'conflict',
    detail: expect.stringContaining('Expected a managed directory link'),
  });
  expect(await readFile(path.join(skill, 'SKILL.md'), 'utf8')).toBe('user-owned');
});

test('preserves a modified managed copy when removing its target', async () => {
  const value = await fixture();
  await syncLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
    copy: true,
  });
  const file = path.join(value.home, '.workbuddy', 'skills', 'hithink-finance-test', 'SKILL.md');
  await writeFile(file, 'user-modified');

  const result = await removeLifecycleSkills(value.packageRoot, value.paths, {
    homeDir: value.home,
    agents: ['workbuddy'],
  });
  expect(result.removed).toEqual([]);
  expect(result.failures[0]).toMatchObject({ name: 'workbuddy', status: 'conflict' });
  expect(await readFile(file, 'utf8')).toBe('user-modified');
  expect(await readSkillsLifecycleStatus(value.packageRoot, value.paths, value.home)).toMatchObject(
    {
      targetsVerified: false,
      targetStatus: 'attention-required',
      targets: [expect.objectContaining({ name: 'workbuddy', status: 'conflict' })],
    },
  );
});
