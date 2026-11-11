import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { authError } from './auth-paths.js';

const run = promisify(execFile);
export function fileCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

// Paths are data in a child-only environment, never PowerShell source or shell arguments.
const aclScript = `
$ErrorActionPreference = 'Stop'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($p in (ConvertFrom-Json $env:HITHINK_AUTH_PERMISSION_PATHS)) {
  if ($env:HITHINK_AUTH_PERMISSION_CREATE -eq '1' -and -not [IO.Directory]::Exists($p)) {
    $newAcl = New-Object System.Security.AccessControl.DirectorySecurity
    $newAcl.SetAccessRuleProtection($true, $false)
    $newAcl.SetOwner($sid)
    $newAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    [void][IO.Directory]::CreateDirectory($p, $newAcl)
  }
  $attributes = [IO.File]::GetAttributes($p)
  if ($attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'reparse point' }
  $isDirectory = [bool]($attributes -band [IO.FileAttributes]::Directory)
  $acl = if ($isDirectory) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }
  if ($env:HITHINK_AUTH_PERMISSION_SET -eq '1') {
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    $inherit = if ($isDirectory) { 'ContainerInherit,ObjectInherit' } else { 'None' }
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl',$inherit,'None','Allow')
    $acl.AddAccessRule($rule)
    $acl.SetOwner($sid)
    if ($isDirectory) { [IO.Directory]::SetAccessControl($p, $acl) } else { [IO.File]::SetAccessControl($p, $acl) }
    $acl = if ($isDirectory) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }
  }
  if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'owner mismatch' }
  if ($isDirectory -and -not $acl.AreAccessRulesProtected) { throw 'inherited permissions' }
  $allowed = $false
  foreach ($rule in $acl.Access) {
    if ($rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'foreign permission' }
    if ($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq [System.Security.AccessControl.FileSystemRights]::FullControl) { $allowed = $true }
  }
  if (-not $allowed) { throw 'missing private access' }
}`;

export async function privatePaths(
  paths: string[],
  set = false,
  create = false,
  audit = false,
): Promise<void> {
  try {
    for (const p of paths) {
      if (create && process.platform === 'win32') continue;
      const info = await lstat(p);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw Error();
      if (process.platform !== 'win32') {
        if (info.uid !== process.getuid?.()) throw Error();
        if (set) await chmod(p, info.isDirectory() ? 0o700 : 0o600);
        else if ((info.mode & 0o077) !== 0) throw Error();
      }
    }
    // DACLs are established on creation/migration and audited explicitly; ordinary reads use lstat.
    if (process.platform === 'win32' && (set || create || audit))
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', aclScript], {
        windowsHide: true,
        timeout: 1800,
        maxBuffer: 4096,
        env: {
          ...process.env,
          HITHINK_AUTH_PERMISSION_PATHS: JSON.stringify(paths),
          HITHINK_AUTH_PERMISSION_SET: set ? '1' : '0',
          HITHINK_AUTH_PERMISSION_CREATE: create ? '1' : '0',
        },
      });
  } catch {
    throw authError(
      'AUTH_STORAGE_PERMISSIONS',
      'Credential storage must be private and owned by the current user.',
      true,
    );
  }
}

export async function ensureAuthDirectory(root: string): Promise<void> {
  const dirs = [path.dirname(path.dirname(root)), path.dirname(root), root];
  if (process.platform === 'win32') {
    let missing = false;
    for (const dir of dirs) {
      try {
        await lstat(dir);
      } catch (error) {
        if (fileCode(error) !== 'ENOENT') throw error;
        missing = true;
      }
    }
    await privatePaths(dirs, false, missing);
    return;
  }
  for (const dir of dirs) {
    try {
      await mkdir(dir, { mode: 0o700 });
      await privatePaths([dir], true);
    } catch (error) {
      if (fileCode(error) !== 'EEXIST') throw error;
      await privatePaths([dir]);
    }
  }
}

export async function writeAuthAtomic(target: string, value: unknown): Promise<void> {
  const temporary = path.join(path.dirname(target), `.${randomUUID()}.tmp`);
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      // Windows files inherit the private DACL of the initialized credential directory.
      await privatePaths([temporary], process.platform !== 'win32');
      await handle.writeFile(JSON.stringify(value) + '\n', 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, target);
        break;
      } catch (error) {
        if (
          process.platform !== 'win32' ||
          !['EPERM', 'EACCES', 'EBUSY', 'EEXIST'].includes(fileCode(error) ?? '') ||
          attempt === 3
        )
          throw error;
        await delay(30 * (attempt + 1));
      }
    }
    if (process.platform !== 'win32') {
      const directory = await open(path.dirname(target), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await unlink(temporary).catch((error) => {
      if (fileCode(error) !== 'ENOENT') throw error;
    });
  }
}

/** Called only while owning the fixed state lock; live writers cannot own these files. */
export async function removeAbandonedAuthWrites(root: string): Promise<void> {
  for (const name of await readdir(root)) {
    if (/^\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp$/u.test(name))
      await unlink(path.join(root, name));
  }
}
