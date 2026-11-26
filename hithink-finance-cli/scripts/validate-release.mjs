import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertReleaseRef(version, tag, head, workflowSha) {
  assert.equal(tag, `v${version}`, 'Tag and package version must match.');
  assert.equal(
    head,
    workflowSha,
    'Dispatch the workflow on the release tag so provenance uses its SHA.',
  );
}

export function assertSuccessfulValidation(response, repository, sha) {
  const accepted = response.workflow_runs?.find(
    (run) =>
      run.head_sha === sha &&
      run.head_branch === 'main' &&
      run.event === 'push' &&
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      run.repository?.full_name?.toLowerCase() === repository.toLowerCase(),
  );
  assert(accepted, 'No successful main-branch validation for this exact repository and SHA.');
}

export function versionPublished(versions, version) {
  const list = typeof versions === 'string' ? [versions] : versions;
  assert(
    Array.isArray(list) && list.every((item) => typeof item === 'string'),
    'Invalid registry version list.',
  );
  return list.includes(version);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, file] = process.argv.slice(2);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (mode === 'ref') {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    assertReleaseRef(pkg.version, process.env.RELEASE_TAG, head, process.env.GITHUB_SHA);
  } else if (mode === 'ci') {
    assertSuccessfulValidation(
      JSON.parse(readFileSync(file, 'utf8')),
      process.env.GITHUB_REPOSITORY,
      process.env.GITHUB_SHA,
    );
  } else if (mode === 'registry') {
    console.log(
      `published=${versionPublished(JSON.parse(readFileSync(file, 'utf8')), pkg.version)}`,
    );
  } else throw Error('Expected ref, ci or registry mode.');
}
