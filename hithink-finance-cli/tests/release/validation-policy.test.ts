import { expect, test } from 'vitest';
// @ts-expect-error Maintainer script is plain JavaScript.
import {
  assertReleaseRef,
  assertSuccessfulValidation,
  versionPublished,
} from '../../scripts/validate-release.mjs';

const sha = 'a'.repeat(40);
const repository = 'example/project';
const run = {
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  repository: { full_name: repository },
};

test('only matching tag and workflow source can publish', () => {
  expect(() => assertReleaseRef('0.2.4', 'v0.2.4', sha, sha)).not.toThrow();
  expect(() => assertReleaseRef('0.2.4', 'v0.2.3', sha, sha)).toThrow();
  expect(() => assertReleaseRef('0.2.4', 'v0.2.4', sha, 'b'.repeat(40))).toThrow();
});
test('reuses a successful main push at the exact source SHA', () => {
  expect(() => assertSuccessfulValidation({ workflow_runs: [run] }, repository, sha)).not.toThrow();
});
test.each([
  { head_sha: 'b'.repeat(40) },
  { head_branch: 'feature' },
  { event: 'pull_request' },
  { event: 'workflow_dispatch' },
  { conclusion: 'failure' },
  { status: 'in_progress' },
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
