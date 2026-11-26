import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const options = { stdio: 'inherit', shell: process.platform === 'win32' };
execFileSync('npm', ['run', 'verify'], options);

const scratch = mkdtempSync(join(tmpdir(), 'finance-release-preflight-'));
try {
  execFileSync('npm', ['run', 'verify:release-package'], {
    ...options,
    env: { ...process.env, TMPDIR: scratch, TEMP: scratch, TMP: scratch },
  });
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
