import { execFile } from 'node:child_process';
import { lstat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);

/** Secure only this plugin's storage. No message content or credentials enter the command. */
export async function preparePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, {recursive: true, mode: 0o700});
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('private-storage-unavailable');
  if (process.platform !== 'win32') return;
  const script = `
$ErrorActionPreference = 'Stop'
$directory = $env:PASEO_PLAIN_PRIVATE_DIRECTORY
$owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$identities = @($owner, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))
$acl = [System.Security.AccessControl.DirectorySecurity]::new()
$acl.SetOwner($owner)
$acl.SetAccessRuleProtection($true, $false)
foreach ($identity in $identities) {
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
Set-Acl -LiteralPath $directory -AclObject $acl
foreach ($name in @('configuration.json', 'cache.json')) {
  $file = Join-Path $directory $name
  if (-not (Test-Path -LiteralPath $file)) { continue }
  $item = Get-Item -LiteralPath $file -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe storage file' }
  $fileAcl = [System.Security.AccessControl.FileSecurity]::new()
  $fileAcl.SetOwner($owner)
  $fileAcl.SetAccessRuleProtection($true, $false)
  foreach ($identity in $identities) {
    $fileAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow'))
  }
  Set-Acl -LiteralPath $file -AclObject $fileAcl
}
`;
  await execute(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      env: {...process.env, PASEO_PLAIN_PRIVATE_DIRECTORY: directory},
      timeout: 15000, maxBuffer: 16384, windowsHide: true,
    });
}
