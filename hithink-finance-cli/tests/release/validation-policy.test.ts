import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
// @ts-expect-error Maintainer script is plain JavaScript.
import {
  assertReleaseArtifact,
  assertReleaseRef,
  assertRegistryIntegrity,
  assertSuccessfulValidation,
  releaseReceiptFile,
  versionPublished,
} from '../../scripts/validate-release.mjs';

const sha = 'a'.repeat(40);
const repository = 'example/project';
const run = {
  id: 5325,
  run_attempt: 2,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: repository },
};

test('only matching tag and workflow source can publish', () => {
  const ref = 'refs/tags/v0.2.4';
  expect(() => assertReleaseRef('0.2.4', 'v0.2.4', sha, sha, ref)).not.toThrow();
  expect(() => assertReleaseRef('0.2.4', 'v0.2.3', sha, sha, ref)).toThrow();
  expect(() => assertReleaseRef('0.2.4', 'v0.2.4', sha, 'b'.repeat(40), ref)).toThrow();
  expect(() => assertReleaseRef('0.2.4', 'v0.2.4', sha, sha, 'refs/heads/main')).toThrow();
});

test('plugin versions use a separate tag prefix and published npm bytes must match', () => {
  const tag = 'dsh-finance-v0.1.0';
  expect(() =>
    assertReleaseRef('0.1.0', tag, sha, sha, `refs/tags/${tag}`, 'dsh-finance-v'),
  ).not.toThrow();
  expect(() =>
    assertReleaseRef('0.1.0', 'v0.1.0', sha, sha, 'refs/tags/v0.1.0', 'dsh-finance-v'),
  ).toThrow();
  const hash = (text: string) => 'sha512-' + createHash('sha512').update(text).digest('base64');
  expect(() => assertRegistryIntegrity(hash('verified'), hash('verified'))).not.toThrow();
  expect(() => assertRegistryIntegrity(hash('other'), hash('verified'))).toThrow(
    'The published npm version has different tarball integrity.',
  );
  expect(() => assertRegistryIntegrity(undefined, undefined)).toThrow(
    'Invalid verified tarball integrity.',
  );
});
test('reuses a successful main push at the exact source SHA', () => {
  expect(assertSuccessfulValidation({ workflow_runs: [run] }, repository, sha)).toBe(run);
});
test.each([
  { head_sha: 'b'.repeat(40) },
  { head_branch: 'feature' },
  { event: 'pull_request' },
  { event: 'workflow_dispatch' },
  { conclusion: 'failure' },
  { status: 'in_progress' },
  { id: '42' },
  { run_attempt: 0 },
  { repository: { full_name: 'other/project' } },
])('rejects untrusted or stale validation: %j', (change) => {
  expect(() =>
    assertSuccessfulValidation({ workflow_runs: [{ ...run, ...change }] }, repository, sha),
  ).toThrow();
});
test('missing validation and registry errors fail closed', () => {
  expect(() => assertSuccessfulValidation({ workflow_runs: [] }, repository, sha)).toThrow();
  expect(() => versionPublished({ error: { code: 'E404' } }, '0.2.4')).toThrow();
  expect(versionPublished(['0.2.3', '0.2.4'], '0.2.4')).toBe(true);
  expect(versionPublished(['0.2.3'], '0.2.4')).toBe(false);
});

test('publishes only the tarball checked by the selected run and attempt', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'hithink-release-policy-'));
  try {
    const fixture = path.join(directory, 'fixture');
    const artifact = path.join(directory, 'artifact');
    const pkg = { name: '@hithink-tech/hithink-finance-cli', version: '0.2.5' };
    const filename = 'hithink-tech-hithink-finance-cli-0.2.5.tgz';
    const tarball = path.join(artifact, filename);
    const receiptPath = path.join(artifact, releaseReceiptFile);
    const source = { repository, sha, runId: String(run.id), runAttempt: String(run.run_attempt) };
    await mkdir(artifact);
    await mkdir(path.join(fixture, 'package'), { recursive: true });
    const pack = async (contents: { name: string; version: string }) => {
      await writeFile(path.join(fixture, 'package', 'package.json'), JSON.stringify(contents));
      execFileSync('tar', ['-czf', tarball, '-C', fixture, 'package'], { windowsHide: true });
      return (
        'sha512-' +
        createHash('sha512')
          .update(await readFile(tarball))
          .digest('base64')
      );
    };
    const receipt = {
      ...source,
      ...pkg,
      filename,
      installedSmoke: 'passed',
      integrity: await pack(pkg),
    };
    await writeFile(receiptPath, JSON.stringify(receipt));
    expect(assertReleaseArtifact(artifact, pkg, source)).toBe(tarball);
    expect(() => assertReleaseArtifact(artifact, pkg, { ...source, runAttempt: '1' })).toThrow(
      'Artifact run attempt mismatch.',
    );
    expect(() => assertReleaseArtifact(artifact, pkg, { ...source, sha: 'b'.repeat(40) })).toThrow(
      'Artifact commit mismatch.',
    );

    await appendFile(tarball, 'damage');
    expect(() => assertReleaseArtifact(artifact, pkg, source)).toThrow(
      'Artifact integrity mismatch.',
    );
    const integrity = await pack({ ...pkg, version: '0.2.4' });
    await writeFile(receiptPath, JSON.stringify({ ...receipt, integrity }));
    expect(() => assertReleaseArtifact(artifact, pkg, source)).toThrow(
      'Tarball package version mismatch.',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
