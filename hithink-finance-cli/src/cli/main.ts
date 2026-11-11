#!/usr/bin/env node
import { createRequire } from 'node:module';

if (process.argv.length === 3 && ['--version', '-V'].includes(process.argv[2] ?? '')) {
  const metadata = createRequire(import.meta.url)('../../package.json') as { version: string };
  process.stdout.write(`${metadata.version}\n`);
} else {
  const argv = process.argv.slice(2);
  try {
    const result = await (await import('./worker/client.js')).tryWorker(argv);
    if (result && 'code' in result) process.exitCode = result.code;
    else await (await import('./run.js')).runForeground(argv, result?.input);
  } catch (error) {
    process.exitCode = await (await import('./run.js')).renderFailure(argv, error);
  }
}
