import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
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
$trusted = @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')
foreach ($p in $env:HITHINK_AUTH_PERMISSION_PATHS.Split([char]10)) {
  if ($env:HITHINK_AUTH_PERMISSION_CREATE -eq '1' -and -not [IO.Directory]::Exists($p)) {
    $newAcl = [System.Security.AccessControl.DirectorySecurity]::new()
    $newAcl.SetAccessRuleProtection($true, $false)
    $newAcl.SetOwner($sid)
    $newAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    [void][IO.Directory]::CreateDirectory($p, $newAcl)
  }
  $attributes = [IO.File]::GetAttributes($p)
  if ($attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'reparse point' }
  $isDirectory = [bool]($attributes -band [IO.FileAttributes]::Directory)
  $acl = if ($isDirectory) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }
  if ($env:HITHINK_AUTH_PERMISSION_SET -eq '1') {
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) { [void]$acl.RemoveAccessRuleSpecific($rule) }
    $inherit = if ($isDirectory) { 'ContainerInherit,ObjectInherit' } else { 'None' }
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl',$inherit,'None','Allow')
    $acl.AddAccessRule($rule)
    $acl.SetOwner($sid)
    if ($isDirectory) { [IO.Directory]::SetAccessControl($p, $acl) } else { [IO.File]::SetAccessControl($p, $acl) }
    $acl = if ($isDirectory) { [IO.Directory]::GetAccessControl($p) } else { [IO.File]::GetAccessControl($p) }
  }
  if ($trusted -notcontains $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value) { throw 'untrusted owner' }
  $allowed = $false
  foreach ($rule in $acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -ne 'Allow') { continue }
    if ($trusted -notcontains $rule.IdentityReference.Value) { throw 'foreign permission' }
    $allowed = $true
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
        const uid = process.getuid?.();
        if (info.uid !== uid && info.uid !== 0 && uid !== 0) throw Error();
        if (set) {
          if (uid === 0) {
            const handle = await open(
              p,
              constants.O_RDONLY |
                constants.O_NOFOLLOW |
                (info.isDirectory() ? constants.O_DIRECTORY : 0),
            );
            try {
              const opened = await handle.stat();
              if (
                opened.ino !== info.ino ||
                opened.dev !== info.dev ||
                (!info.isDirectory() && opened.nlink !== 1)
              )
                throw Error();
              await handle.chmod(info.isDirectory() ? 0o700 : 0o600);
              const parent = await lstat(path.dirname(p));
              if (parent.isSymbolicLink() || !parent.isDirectory()) throw Error();
              // Keep root-created state usable by the owner of a mounted user directory.
              if (opened.uid === 0 && parent.uid !== 0) await handle.chown(parent.uid, parent.gid);
            } finally {
              await handle.close();
            }
          } else await chmod(p, info.isDirectory() ? 0o700 : 0o600);
        } else if ((info.mode & (info.isDirectory() ? 0o022 : 0o077)) !== 0) throw Error();
      }
    }
    // DACLs are established on creation/migration and audited explicitly; ordinary reads use lstat.
    if (process.platform === 'win32' && paths.length > 0 && (set || create || audit)) {
      // Windows paths cannot contain CR/LF; keep path data separate from PowerShell source.
      if (paths.some((p) => /[\r\n]/u.test(p))) throw Error('Invalid Windows path.');
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', aclScript], {
        windowsHide: true,
        // Include cold PowerShell startup under contention within the login startup budget.
        timeout: 5000,
        maxBuffer: 4096,
        env: {
          ...process.env,
          HITHINK_AUTH_PERMISSION_PATHS: paths.join('\n'),
          HITHINK_AUTH_PERMISSION_SET: set ? '1' : '0',
          HITHINK_AUTH_PERMISSION_CREATE: create ? '1' : '0',
        },
      });
    }
  } catch (cause) {
    const failure = authError(
      'AUTH_STORAGE_PERMISSIONS',
      'Credential storage is unavailable or permits access by another user.',
      true,
    );
    Object.defineProperty(failure, 'cause', { value: cause });
    throw failure;
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
