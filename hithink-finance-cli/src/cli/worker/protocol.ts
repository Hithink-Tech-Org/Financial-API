import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Socket } from 'node:net';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { CliError } from '../../contracts/errors.js';

export const PROTOCOL = 1;
export const MAX_FRAME = 8 * 1024 * 1024;
export type Frame = Record<string, unknown>;
export function workerError(code: string, message: string): CliError {
  return new CliError({
    code,
    message,
    category: 'local-data',
    hint: 'Inspect worker status, or retry explicitly with HITHINK_FINANCE_NO_WORKER=1.',
    retryable: false,
    exitCode: 5,
  });
}
export function proof(
  secret: string,
  role: string,
  a: string,
  b: string,
  instance: string,
): string {
  return createHmac('sha256', secret)
    .update(JSON.stringify([PROTOCOL, role, a, b, instance]))
    .digest('hex');
}
export function matchesProof(a: unknown, b: string): boolean {
  return (
    typeof a === 'string' &&
    /^[a-f0-9]{64}$/u.test(a) &&
    timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  );
}
export async function* frames(
  input: AsyncIterable<Buffer | string>,
  limit = MAX_FRAME,
): AsyncGenerator<Frame> {
  let pieces: Buffer[] = [],
    size = 0;
  for await (const value of input) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    let start = 0;
    while (start < chunk.length) {
      const end = chunk.indexOf(10, start);
      const piece = chunk.subarray(start, end < 0 ? chunk.length : end);
      size += piece.length;
      if (size > limit) throw Error('Worker frame exceeds the input limit.');
      pieces.push(piece);
      if (end < 0) break;
      let frame: unknown;
      try {
        frame = JSON.parse(Buffer.concat(pieces, size).toString('utf8'));
      } catch {
        throw Error('Invalid worker frame.');
      }
      if (!frame || typeof frame !== 'object' || Array.isArray(frame))
        throw Error('Invalid worker frame.');
      pieces = [];
      size = 0;
      yield frame as Frame;
      start = end + 1;
    }
  }
  if (size) throw Error('Incomplete worker frame.');
}
export async function send(socket: Socket, frame: Frame): Promise<void> {
  if (socket.destroyed || !socket.writable) throw Error('Worker connection closed.');
  const line = JSON.stringify(frame) + '\n';
  if (Buffer.byteLength(line) > MAX_FRAME) throw Error('Worker frame exceeds the input limit.');
  if (!socket.write(line))
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.off('drain', drained);
        socket.off('close', closed);
        socket.off('error', failed);
      };
      const drained = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(Error('Worker connection closed.'));
      };
      const closed = failed;
      socket.once('drain', drained);
      socket.once('close', closed);
      socket.once('error', failed);
    });
}
export async function next(reader: AsyncGenerator<Frame>): Promise<Frame> {
  const frame = await reader.next();
  if (frame.done) throw Error('Worker connection closed.');
  return frame.value;
}
export async function authenticateClient(
  socket: Socket,
  reader: AsyncGenerator<Frame>,
  secret: string,
  instance: string,
): Promise<void> {
  const nonce = randomBytes(32).toString('hex');
  await send(socket, { t: 'hello', nonce });
  const response = await next(reader);
  if (
    response.t !== 'proof' ||
    response.instance !== instance ||
    typeof response.nonce !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(response.nonce) ||
    !matchesProof(response.mac, proof(secret, 'server', nonce, response.nonce, instance))
  )
    throw Error('Worker identity verification failed.');
  await send(socket, { t: 'auth', mac: proof(secret, 'client', nonce, response.nonce, instance) });
  if ((await next(reader)).t !== 'ready') throw Error('Worker handshake failed.');
}
export async function authenticateServer(
  socket: Socket,
  reader: AsyncGenerator<Frame>,
  secret: string,
  instance: string,
): Promise<void> {
  const hello = await next(reader);
  if (
    hello.t !== 'hello' ||
    typeof hello.nonce !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(hello.nonce)
  )
    throw Error('Worker handshake failed.');
  const nonce = randomBytes(32).toString('hex');
  await send(socket, {
    t: 'proof',
    nonce,
    instance,
    mac: proof(secret, 'server', hello.nonce, nonce, instance),
  });
  const auth = await next(reader);
  if (
    auth.t !== 'auth' ||
    !matchesProof(auth.mac, proof(secret, 'client', hello.nonce, nonce, instance))
  )
    throw Error('Worker handshake failed.');
  await send(socket, { t: 'ready' });
}
export function outputChannel(
  socket: Socket,
  channel: string,
  id: string,
): { stream: NodeJS.WriteStream; finish: () => Promise<void> } {
  const stream = new Writable({
    highWaterMark: 64 * 1024,
    write(chunk: Buffer, _encoding, callback) {
      void (async () => {
        for (let start = 0; start < chunk.length; start += 32 * 1024)
          await send(socket, {
            t: 'output',
            id,
            channel,
            data: chunk.subarray(start, start + 32 * 1024).toString('base64'),
          });
      })().then(
        () => callback(),
        (error: Error) => callback(error),
      );
    },
  });
  stream.on('error', () => undefined);
  return {
    stream: stream as NodeJS.WriteStream,
    finish: async () => {
      stream.end();
      await finished(stream);
    },
  };
}
