import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { throwIfCancelled } from '../contracts/errors.js';
import { renderJson } from './json.js';
import { recordLines } from './records.js';

export type DataFileFormat = 'json' | 'csv' | 'ndjson';

export async function writeDataFile(
  output: string,
  envelope: { data: unknown },
  format: DataFileFormat,
  signal?: AbortSignal,
): Promise<string> {
  throwIfCancelled(signal);
  const target = path.resolve(output);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomUUID()}.tmp`,
  );
  try {
    const chunks = format === 'json' ? [renderJson(envelope)] : recordLines(envelope.data, format);
    await pipeline(
      Readable.from(chunks),
      createWriteStream(temporary, { flags: 'wx', mode: 0o600 }),
      {
        signal,
      },
    );
    throwIfCancelled(signal);
    await rename(temporary, target);
    return target;
  } catch (error) {
    throwIfCancelled(signal);
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}
