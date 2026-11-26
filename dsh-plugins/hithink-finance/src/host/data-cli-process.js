import { pathToFileURL } from 'node:url';

const [runtime, ...args] = process.argv.slice(2);
const cancellation = new AbortController();
process.on('message', (message) => {
  if (message === 'cancel') cancellation.abort('SIGTERM');
});
process.once('disconnect', () => cancellation.abort('SIGTERM'));

try {
  const { executeCommand } = await import(pathToFileURL(runtime).href);
  process.exitCode = await executeCommand(args, { signal: cancellation.signal });
} catch {
  process.exitCode = 1;
} finally {
  if (process.connected) process.disconnect();
}
