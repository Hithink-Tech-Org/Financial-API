import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import { expect, test } from 'vitest';
import { waitForPid, waitForProcessToStop } from '../fixtures/process-lifecycle.js';

test.skipIf(process.platform === 'win32')(
  'SIGTERM interrupts a real update child and exits with signal semantics',
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'hithink-shutdown-child-'));
    const pidFile = path.join(root, 'child.pid');
    const isWindows = process.platform === 'win32';
    const fakeNpm = path.join(root, isWindows ? 'npm.cmd' : 'npm');
    const fakeCli = path.join(root, isWindows ? 'hithink-finance.cmd' : 'hithink-finance');
    try {
      const blocker =
        "require('node:fs').writeFileSync(process.env.FAKE_CHILD_PID, String(process.pid)); setTimeout(() => {}, 1500)";
      if (isWindows) {
        await writeFile(fakeNpm, `@echo off\r\nnode -e "${blocker}"\r\n`);
        await writeFile(fakeCli, '@echo off\r\nexit /b 0\r\n');
      } else {
        await writeFile(fakeNpm, `#!/usr/bin/env node\n${blocker}\n`);
        await writeFile(fakeCli, '#!/usr/bin/env node\n');
        await Promise.all([chmod(fakeNpm, 0o755), chmod(fakeCli, 0o755)]);
      }

      const subprocess = execa(
        'node',
        ['dist/cli/main.js', 'update', '--repair', '--yes', '--format', 'json'],
        {
          reject: false,
          timeout: 8_000,
          env: {
            HITHINK_FINANCE_NPM_EXECUTABLE: fakeNpm,
            HITHINK_FINANCE_CLI_EXECUTABLE: fakeCli,
            FAKE_CHILD_PID: pidFile,
          },
        },
      );
      const childPid = await waitForPid(pidFile);
      subprocess.kill('SIGTERM');
      const result = await subprocess;

      expect(result.exitCode).toBe(143);
      expect(result.timedOut).toBe(false);
      expect(await waitForProcessToStop(childPid)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
