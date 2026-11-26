import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export async function readJson(filename, fallback) {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

export async function managedDirectory(root, name) {
  const directory = path.join(root, name);
  await mkdir(directory, { mode: 0o700 }).catch((error) => {
    if (error.code !== 'EEXIST') throw error;
  });
  if (!(await lstat(directory)).isDirectory() || (await realpath(directory)) !== directory)
    throw new Error('托管目录必须位于工作台目录内。');
  return directory;
}

export async function regularFile(directory, filename, maxBytes) {
  try {
    const file = path.join(directory, filename);
    const info = await lstat(file);
    if (!info.isFile() || info.size > maxBytes || (await realpath(file)) !== file) return undefined;
    return file;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeExclusive(filename, contents, signal) {
  const handle = await open(filename, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(contents, { encoding: 'utf8', signal });
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    await rm(filename, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeAtomic(filename, contents, { signal, replace = false } = {}) {
  const staging = path.join(path.dirname(filename), `.${randomUUID()}.tmp`);
  await writeExclusive(staging, contents, signal);
  try {
    signal?.throwIfAborted();
    await (replace ? rename(staging, filename) : link(staging, filename));
  } finally {
    await rm(staging, { force: true }).catch(() => {});
  }
}
