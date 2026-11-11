import path from 'node:path';
import { identity, KEY_ENV } from './paths.js';
import { startWorker } from './server.js';

for (const name of KEY_ENV) delete process.env[name];
try {
  const paths = await identity(path.resolve(import.meta.dirname, '../../..'));
  if (paths && paths.id === process.argv[2]) await startWorker(paths);
  else process.exitCode = 5;
} catch {
  process.exitCode = 5;
}
