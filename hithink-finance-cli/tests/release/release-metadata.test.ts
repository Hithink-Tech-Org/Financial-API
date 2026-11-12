import { access, readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

test('declares public npm release metadata and an explicit license gate', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
    repository: unknown;
    homepage: string;
    bugs?: unknown;
    version: string;
    dependencies: Record<string, string>;
    bin: unknown;
    engines: { node: string };
    publishConfig: { access: string };
    license: string;
    scripts: {
      prepublishOnly: string;
      test: string;
      'test:built': string;
      verify: string;
      pretest?: string;
    };
  };
  expect(pkg.repository).toEqual({
    type: 'git',
    url: 'git+https://github.com/Hithink-Tech-Org/Financial-API.git',
    directory: 'hithink-finance-cli',
  });
  expect(pkg.bugs).toBeUndefined();
  expect(pkg.homepage).toBe('https://fuyao.aicubes.cn/docs/');
  expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
  expect(pkg.dependencies.skills).toBeUndefined();
  expect(pkg.bin).toEqual({ 'hithink-finance': './dist/cli/main.js' });
  expect(pkg.engines.node).toBe('^22.13.0 || >=24.0.0');
  expect(pkg.publishConfig.access).toBe('public');
  expect(pkg.license).toBe('MIT');
  expect(pkg.scripts.prepublishOnly).toContain('check-license');
  expect(pkg.scripts.pretest).toBeUndefined();
  expect(pkg.scripts.test).toBe('npm run build && vitest run');
  expect(pkg.scripts['test:built']).toBe('vitest run');
  expect(pkg.scripts.verify).toContain('npm run build && npm run test:built');
  await expect(access('LICENSE')).resolves.toBeUndefined();
  await expect(access('CHANGELOG.md')).resolves.toBeUndefined();
  await expect(access('SECURITY.md')).resolves.toBeUndefined();
  await expect(access('docs/maintainers/npm-publishing.md')).resolves.toBeUndefined();
  const publishing = await readFile('docs/maintainers/npm-publishing.md', 'utf8');
  expect(publishing).toContain('hithink-finance-cli-release.yml');
  expect(publishing).toContain('Trusted Publishing');
  expect(publishing).toContain('npm run verify');
  const shrinkwrap = JSON.parse(await readFile('npm-shrinkwrap.json', 'utf8'));
  expect(shrinkwrap.version).toBe(pkg.version);
  expect(shrinkwrap.packages[''].version).toBe(pkg.version);
  expect(shrinkwrap.packages['node_modules/skills']).toBeUndefined();
});
