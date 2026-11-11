import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import { expect, test } from 'vitest';

test('the actual build script changes identity when only pinned dependencies change', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'finance-dependency-build-'));
  try {
    await mkdir(path.join(root, 'scripts'));
    await mkdir(path.join(root, 'dist'));
    await writeFile(
      path.join(root, 'scripts/runtime-build.mjs'),
      await readFile('scripts/runtime-build.mjs'),
    );
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
    await writeFile(path.join(root, 'dist/runtime.js'), 'export const runtime = 1;');
    const lock = path.join(root, 'npm-shrinkwrap.json');
    const script = path.join(root, 'scripts/runtime-build.mjs');
    await writeFile(lock, JSON.stringify({ dependencies: { example: { version: '1.0.0' } } }));
    await execa('node', [script, 'finish']);
    const first = JSON.parse(await readFile(path.join(root, 'dist/runtime-build.json'), 'utf8')).id;
    await writeFile(lock, JSON.stringify({ dependencies: { example: { version: '1.0.1' } } }));
    await execa('node', [script, 'finish']);
    const second = JSON.parse(
      await readFile(path.join(root, 'dist/runtime-build.json'), 'utf8'),
    ).id;
    expect(second).not.toBe(first);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
