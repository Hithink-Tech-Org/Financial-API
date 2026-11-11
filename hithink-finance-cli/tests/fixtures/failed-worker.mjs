import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { appendFile } from 'node:fs/promises';
import { identity, endpoint } from '../../dist/cli/worker/paths.js';
import { withAuthLock } from '../../dist/infrastructure/credentials/auth-state-lock.js';
import { writeAuthAtomic } from '../../dist/infrastructure/credentials/auth-files.js';
import { authenticateServer, frames, next } from '../../dist/cli/worker/protocol.js';
const paths = await identity(path.resolve(import.meta.dirname, '../..'));
const record = {
  pid: process.pid,
  instance: randomBytes(16).toString('hex'),
  secret: randomBytes(32).toString('hex'),
  phase: 'ready',
  until: 0,
};
const server = createServer((socket) => {
  socket.on('error', () => undefined);
  void (async () => {
    const reader = frames(socket);
    await authenticateServer(socket, reader, record.secret, record.instance);
    const request = await next(reader);
    if (request.t === 'run')
      await appendFile(
        path.join(process.env.HITHINK_TEST_USER_HOME, 'submitted.txt'),
        'submitted\n',
      );
  })().finally(() => {
    socket.destroy();
    server.close();
  });
});
await new Promise((resolve) => server.listen(endpoint(paths, record.instance), resolve));
await withAuthLock(paths, () => writeAuthAtomic(paths.document, record));
console.log('ready');
const timer = setTimeout(() => process.exit(1), 10000);
timer.unref();
