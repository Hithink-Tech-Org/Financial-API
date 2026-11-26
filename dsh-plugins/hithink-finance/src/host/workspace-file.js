import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { cancelled, FinanceError } from './cli.js';

function inDirectory(root, path) {
  const child = relative(root, path);
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

export async function readSingleLinkText(path, root, signal, { maxBytes, sizeError, preserveBom = false }) {
  let handle;
  try {
    const target = await realpath(path);
    if (!inDirectory(root, target)) throw new Error();
    const before = await lstat(target, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n) throw new Error();
    if (before.size > maxBytes) throw sizeError ?? new Error('File exceeds its size limit');
    handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const sameFile = (info) => info.dev === before.dev && info.ino === before.ino && info.nlink === 1n && info.isFile();
    if (!sameFile(await handle.stat({ bigint: true })) || await realpath(path) !== target) throw new Error();
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (offset !== Number(before.size) || after.mtimeNs !== before.mtimeNs ||
        !sameFile(after) || await realpath(path) !== target ||
        !sameFile(await lstat(target, { bigint: true }))) throw new Error();
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: preserveBom }).decode(buffer.subarray(0, offset));
  } finally {
    await handle?.close();
  }
}

export async function readWorkspaceText(file, session, policy, signal, options) {
  const cwd = session?.header?.cwd;
  if (!isAbsolute(cwd ?? '') || !isAbsolute(policy?.workspaceRoot ?? '')) throw options.workspaceError;
  if (typeof file !== 'string' || file.length > 2048 || file.includes('\0') ||
      !options.extensions.includes(extname(file).toLowerCase())) throw options.pathError;
  try {
    const root = await realpath(policy.workspaceRoot);
    const working = await realpath(cwd);
    const path = resolve(working, file);
    if (!inDirectory(root, working) || !inDirectory(root, path) ||
        (sep === '\\' && relative(root, path).includes(':'))) throw new Error();
    return await readSingleLinkText(path, root, signal, options);
  } catch (error) {
    if (signal.aborted) throw cancelled();
    if (error instanceof FinanceError) throw error;
    throw options.readError;
  }
}
