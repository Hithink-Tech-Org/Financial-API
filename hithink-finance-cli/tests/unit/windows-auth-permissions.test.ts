import { execFile as realExecFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { authPaths } from '../../src/infrastructure/credentials/auth-paths.js';
import { GlobalCredentialStore } from '../../src/infrastructure/credentials/global-store.js';
import { privatePaths } from '../../src/infrastructure/credentials/auth-files.js';

const fixture = vi.hoisted(() => ({
  owner: '',
  extraPrincipal: '',
  modifyOnly: false,
  delayMs: 0,
  noModules: false,
}));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  const execFile = ((command, args, options, callback) => {
    if (
      command === 'powershell.exe' &&
      Array.isArray(args) &&
      options?.env?.HITHINK_AUTH_PERMISSION_PATHS
    ) {
      const marker =
        '  $acl = if ($isDirectory) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }';
      const script =
        (fixture.noModules ? "$PSModuleAutoLoadingPreference='None'\n" : '') +
        (fixture.delayMs
          ? '[Threading.Thread]::Sleep([int]$env:TEST_AUTH_PERMISSION_DELAY_MS)\n'
          : '') +
        String(args.at(-1));
      if (!script.includes(marker)) throw Error('ACL fixture injection point changed.');
      args = [
        ...args.slice(0, -1),
        script.replace(
          marker,
          marker +
            `
  if (-not $isDirectory -and $env:TEST_AUTH_FILE_OWNER) {
    $acl.SetOwner([System.Security.Principal.SecurityIdentifier]::new($env:TEST_AUTH_FILE_OWNER))
  }
  if ($env:TEST_AUTH_EXTRA_PRINCIPAL) {
    $extra = [System.Security.Principal.SecurityIdentifier]::new($env:TEST_AUTH_EXTRA_PRINCIPAL)
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($extra,'FullControl','Allow'))
  }
  if ($env:TEST_AUTH_MODIFY_ONLY -eq '1') {
    $acl.SetAccessRuleProtection($true,$false)
    foreach($entry in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($entry) }
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'Modify','Allow'))
  }
`,
        ),
      ];
      options = {
        ...options,
        env: {
          ...options.env,
          TEST_AUTH_FILE_OWNER: fixture.owner,
          TEST_AUTH_EXTRA_PRINCIPAL: fixture.extraPrincipal,
          TEST_AUTH_MODIFY_ONLY: fixture.modifyOnly ? '1' : '0',
          TEST_AUTH_PERMISSION_DELAY_MS: String(fixture.delayMs),
        },
      };
    }
    return actual.execFile(command, args, options, callback);
  }) as typeof realExecFile;
  return { ...actual, execFile };
});

const homes: string[] = [];

test.skipIf(process.platform !== 'win32')(
  'Windows path framing rejects embedded line breaks before creating directories',
  async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'finance-acl-framing-'));
    homes.push(home);
    const first = path.join(home, 'first'),
      second = path.join(home, 'second');
    const operation = privatePaths([first + '\n' + second], false, true);
    await expect(operation).rejects.toMatchObject({
      code: 'AUTH_STORAGE_PERMISSIONS',
      cause: expect.any(Error),
    });
    await expect(access(first)).rejects.toHaveProperty('code', 'ENOENT');
    await expect(access(second)).rejects.toHaveProperty('code', 'ENOENT');
  },
);
afterEach(async () => {
  fixture.owner = '';
  fixture.extraPrincipal = '';
  fixture.modifyOnly = false;
  fixture.delayMs = 0;
  fixture.noModules = false;
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});

// Substitute only in-memory ACL metadata; no elevated process or real owner changes are required.
test.skipIf(process.platform !== 'win32').each([
  { owner: 'S-1-5-32-544', extraPrincipal: 'S-1-5-18', modifyOnly: false },
  { owner: 'S-1-5-18', extraPrincipal: 'S-1-5-32-544', modifyOnly: false },
  { owner: '', extraPrincipal: '', modifyOnly: true },
  { owner: '', extraPrincipal: '', modifyOnly: false, delayMs: 2000 },
  { owner: 'S-1-5-32-544', extraPrincipal: 'S-1-5-18', modifyOnly: false, noModules: true },
])(
  'first login accepts normal Windows ACL variations: %j',
  async (scenario) => {
    Object.assign(fixture, scenario);
    const home = await mkdtemp(path.join(os.tmpdir(), 'finance-windows-acl-'));
    homes.push(home);
    const store = new GlobalCredentialStore(
      authPaths(() => home),
      {
        async get() {
          return undefined;
        },
        async set() {},
        async delete() {
          return false;
        },
        async listAccounts() {
          return [];
        },
      },
    );
    await store.transaction(async () => undefined);
    expect((await store.read())?.schema_version).toBe(2);
    await expect(store.auditPermissions()).resolves.toBeUndefined();
  },
  30000,
);

test.skipIf(process.platform !== 'win32')(
  'first login uses inherited user Modify and system/admin permissions',
  async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'finance-windows-inherited-'));
    homes.push(home);
    const paths = authPaths(() => home);
    await mkdir(paths.root, { recursive: true });
    await promisify(realExecFile)(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `
$ErrorActionPreference='Stop'
$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($p in (ConvertFrom-Json $env:TEST_AUTH_DIRECTORY_PATHS)) {
  $acl=[IO.Directory]::GetAccessControl($p)
  $acl.SetAccessRuleProtection($true,$false)
  foreach($entry in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($entry) }
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'Modify','ContainerInherit,ObjectInherit','None','Allow')))
  foreach($value in @('S-1-5-18','S-1-5-32-544')) {
    $principal=New-Object System.Security.Principal.SecurityIdentifier($value)
    $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
  }
  [IO.Directory]::SetAccessControl($p,$acl)
}
foreach($p in ((ConvertFrom-Json $env:TEST_AUTH_DIRECTORY_PATHS) | Select-Object -Skip 1)) {
  $acl=[IO.Directory]::GetAccessControl($p)
  $acl.SetAccessRuleProtection($false,$true)
  [IO.Directory]::SetAccessControl($p,$acl)
}
`,
      ],
      {
        windowsHide: true,
        timeout: 10000,
        env: {
          ...process.env,
          TEST_AUTH_DIRECTORY_PATHS: JSON.stringify([
            home,
            path.dirname(path.dirname(paths.root)),
            path.dirname(paths.root),
            paths.root,
          ]),
        },
      },
    );
    const store = new GlobalCredentialStore(paths, {
      async get() {
        return undefined;
      },
      async set() {},
      async delete() {
        return false;
      },
      async listAccounts() {
        return [];
      },
    });
    await store.transaction(async () => undefined);
    await expect(store.auditPermissions()).resolves.toBeUndefined();
  },
  30000,
);

test.skipIf(process.platform !== 'win32').each([
  { owner: 'S-1-5-21-111-222-333-4444', extraPrincipal: '' },
  { owner: '', extraPrincipal: 'S-1-1-0' },
])(
  'first login rejects untrusted credential access: %j',
  async (scenario) => {
    Object.assign(fixture, scenario);
    const home = await mkdtemp(path.join(os.tmpdir(), 'finance-windows-acl-'));
    homes.push(home);
    const store = new GlobalCredentialStore(
      authPaths(() => home),
      {
        async get() {
          return undefined;
        },
        async set() {},
        async delete() {
          return false;
        },
        async listAccounts() {
          return [];
        },
      },
    );
    const action = vi.fn(async () => undefined);
    await expect(store.transaction(action)).rejects.toMatchObject({
      code: 'AUTH_STORAGE_PERMISSIONS',
    });
    expect(action).not.toHaveBeenCalled();
  },
  30000,
);
