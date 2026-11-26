import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const releaseReceiptFile = 'release-package.json';

export function assertReleaseRef(version, tag, head, workflowSha, workflowRef) {
  assert.equal(tag, `v${version}`, 'Tag and package version must match.');
  assert.equal(workflowRef, `refs/tags/${tag}`, 'Run the release workflow on the release tag ref.');
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
  assert(Number.isSafeInteger(accepted.id) && accepted.id > 0, 'Invalid validation run ID.');
  assert(
    Number.isSafeInteger(accepted.run_attempt) && accepted.run_attempt > 0,
    'Invalid validation run attempt.',
  );
  return accepted;
}

export function assertReleaseArtifact(directory, pkg, source) {
  assert(
    source.repository &&
      /^[a-f0-9]{40}$/u.test(source.sha) &&
      /^[1-9][0-9]*$/u.test(source.runId) &&
      /^[1-9][0-9]*$/u.test(source.runAttempt),
    'Missing release validation identity.',
  );
  const filename = `${pkg.name.replace(/^@/u, '').replace('/', '-')}-${pkg.version}.tgz`;
  assert.deepEqual(
    readdirSync(directory).sort(),
    [releaseReceiptFile, filename].sort(),
    'Expected exactly the verified tarball and its release receipt.',
  );
  const receiptPath = path.join(directory, releaseReceiptFile);
  const tarball = path.resolve(directory, filename);
  assert(lstatSync(receiptPath).isFile() && lstatSync(tarball).isFile(), 'Invalid release files.');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.installedSmoke, 'passed', 'The artifact must pass installed-package smoke.');
  assert.equal(receipt.repository, source.repository, 'Artifact repository mismatch.');
  assert.equal(receipt.sha, source.sha, 'Artifact commit mismatch.');
  assert.equal(receipt.runId, source.runId, 'Artifact run ID mismatch.');
  assert.equal(receipt.runAttempt, source.runAttempt, 'Artifact run attempt mismatch.');
  assert.equal(receipt.filename, filename, 'Artifact filename mismatch.');
  assert.equal(receipt.name, pkg.name, 'Artifact package name mismatch.');
  assert.equal(receipt.version, pkg.version, 'Artifact package version mismatch.');
  const integrity = 'sha512-' + createHash('sha512').update(readFileSync(tarball)).digest('base64');
  assert.equal(receipt.integrity, integrity, 'Artifact integrity mismatch.');
  const embedded = JSON.parse(
    execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 64 * 1024,
    }),
  );
  assert.equal(embedded.name, pkg.name, 'Tarball package name mismatch.');
  assert.equal(embedded.version, pkg.version, 'Tarball package version mismatch.');
  return tarball;
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
    assertReleaseRef(
      pkg.version,
      process.env.RELEASE_TAG,
      head,
      process.env.GITHUB_SHA,
      process.env.GITHUB_REF,
    );
  } else if (mode === 'ci') {
    const run = assertSuccessfulValidation(
      JSON.parse(readFileSync(file, 'utf8')),
      process.env.GITHUB_REPOSITORY,
      process.env.GITHUB_SHA,
    );
    console.log(`run_id=${run.id}`);
    console.log(`run_attempt=${run.run_attempt}`);
    console.log(`artifact_name=hithink-finance-cli-release-${run.head_sha}-${run.run_attempt}`);
  } else if (mode === 'artifact') {
    const tarball = assertReleaseArtifact(file, pkg, {
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
      runId: process.env.VALIDATION_RUN_ID,
      runAttempt: process.env.VALIDATION_RUN_ATTEMPT,
    });
    assert(!/[\r\n]/u.test(tarball));
    console.log(`tarball=${tarball}`);
  } else if (mode === 'registry') {
    console.log(
      `published=${versionPublished(JSON.parse(readFileSync(file, 'utf8')), pkg.version)}`,
    );
  } else throw Error('Expected ref, ci, artifact or registry mode.');
}
