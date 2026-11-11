import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { expect, test } from 'vitest';
import { frames, proof, matchesProof, send } from '../../src/cli/worker/protocol.js';

test('mutual proofs are role/nonce/instance bound and reject forged values', () => {
  const secret = randomBytes(32).toString('hex');
  const a = randomBytes(32).toString('hex'),
    b = randomBytes(32).toString('hex');
  const signed = proof(secret, 'server', a, b, 'instance');
  expect(matchesProof(signed, proof(secret, 'server', a, b, 'instance'))).toBe(true);
  expect(matchesProof(signed, proof(secret, 'client', a, b, 'instance'))).toBe(false);
  expect(matchesProof('invalid', signed)).toBe(false);
});

test('a closed backpressured socket rejects instead of waiting forever', async () => {
  const socket = Object.assign(new EventEmitter(), {
    destroyed: false,
    writable: true,
    write: () => false,
  });
  const pending = send(socket as unknown as Socket, { t: 'test' });
  socket.emit('close');
  await expect(pending).rejects.toThrow('closed');
  expect(socket.listenerCount('drain')).toBe(0);
});

test('frames preserve fragmented UTF8 and bound input before JSON parsing', async () => {
  const value = { t: 'test', data: '中文🙂' };
  const encoded = Buffer.from(JSON.stringify(value) + '\n');
  const input = Readable.from([...encoded].map((byte) => Buffer.from([byte])));
  const values = [];
  for await (const frame of frames(input)) values.push(frame);
  expect(values).toEqual([value]);
  await expect(frames(Readable.from([Buffer.alloc(100)]), 20).next()).rejects.toThrow();
});
