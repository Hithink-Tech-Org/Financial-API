import path from 'node:path';
import { identity } from '../../dist/cli/worker/paths.js';
import { startWorker } from '../../dist/cli/worker/server.js';
import { readRecord } from '../../dist/cli/worker/paths.js';
const paths = await identity(path.resolve(import.meta.dirname, '../..'));
const polling = setInterval(() => {
  void readRecord(paths).then(
    (record) => {
      if (record?.phase === 'ready' && record.pid === process.pid) {
        console.log('ready');
        clearInterval(polling);
      }
    },
    () => undefined,
  );
}, 20);
try {
  await startWorker(paths, {
    idleMs: Number(process.argv[2] ?? 500),
    taskMs: Number(process.argv[3] ?? 120000),
  });
} catch (error) {
  console.error(error.code ?? error.name, error.message);
  process.exitCode = 1;
} finally {
  clearInterval(polling);
}
