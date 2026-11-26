import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test } from 'vitest';
import { stoppedState, waitForPid, waitForProcessToStop } from '../fixtures/process-lifecycle.js';

test('an empty or zero PID marker never resolves as process group zero', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'finance-pid-marker-'));
  const file = path.join(root, 'pid');
  try {
    await writeFile(file, '');
    let settled = false;
    const result = waitForPid(file).then((pid) => {
      settled = true;
      return pid;
    });
    await delay(50);
    expect(settled).toBe(false);
    await writeFile(file, '0');
    await delay(50);
    expect(settled).toBe(false);
    await writeFile(file, String(process.pid));
    expect(await result).toBe(process.pid);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each([
  ['Z', true],
  ['Z+', true],
  ['X', true],
  ['S', false],
  ['R+', false],
  ['t', false],
] as const)('process state %s reports stopped=%s', (state, stopped) => {
  expect(stoppedState(state)).toBe(stopped);
});
test('a live process remains live after a bounded wait', async () => {
  expect(await waitForProcessToStop(process.pid, 40)).toBe(false);
});
test('invalid PIDs and missing state cannot be mistaken for a stopped child', async () => {
  await expect(waitForProcessToStop(0)).rejects.toThrow('positive');
  expect(() => stoppedState('')).toThrow('Missing');
});
