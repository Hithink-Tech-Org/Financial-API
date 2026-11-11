import { performance } from 'node:perf_hooks';
import { execa } from 'execa';
import { expect, test } from 'vitest';

test('--version only loads the entry point and package metadata', async () => {
  const result = await execa('node', [
    '--input-type=module',
    '-e',
    `
    import { register } from 'node:module';
    register('data:text/javascript,' + encodeURIComponent('export function resolve(s,c,n) { if (!s.startsWith("node:") && !s.endsWith("/main.js") && !s.endsWith("/package.json")) throw Error("unexpected version dependency: " + s); return n(s,c); }'), import.meta.url);
    process.argv = [process.execPath, 'dist/cli/main.js', '--version'];
    await import('./dist/cli/main.js');
  `,
  ]);
  expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/u);
});

test('command registration does not load the DuckDB native module', async () => {
  const result = await execa('node', [
    '--input-type=module',
    '-e',
    `
    import { register } from 'node:module';
    register('data:text/javascript,' + encodeURIComponent('export function resolve(s,c,n) { if (s.startsWith("@duckdb/")) throw Error("unexpected native database load"); return n(s,c); }'), import.meta.url);
    await import('./dist/cli/program.js');
    console.log('registered');
  `,
  ]);
  expect(result.stdout).toBe('registered');
});

test('warm version and capabilities stay within a conservative local budget', async () => {
  await execa('node', ['dist/cli/main.js', 'version', '--format', 'json']);
  const start = performance.now();
  await execa('node', ['dist/cli/main.js', 'version', '--format', 'json']);
  await execa('node', ['dist/cli/main.js', 'capabilities', '--format', 'json']);
  expect(performance.now() - start).toBeLessThan(5_000);
});

test('the worker client loads only lightweight modules', async () => {
  const result = await execa('node', [
    '--input-type=module',
    '-e',
    `
    import { register } from 'node:module';
    register('data:text/javascript,' + encodeURIComponent('export function resolve(s,c,n) { if (["zod","commander","openid-client"].includes(s)||s.startsWith("@duckdb/")) throw Error("unexpected heavyweight module"); return n(s,c); }'), import.meta.url);
    await import('./dist/cli/worker/client.js');
    console.log('light');
  `,
  ]);
  expect(result.stdout).toBe('light');
});
