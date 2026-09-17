import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function credentialScope(endpoint, profile) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/mcp') throw new Error('Use an HTTPS gateway URL ending in /mcp, without credentials or query parameters');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile ?? '')) throw new Error('Set CRIA_CREDENTIAL_PROFILE (letters, numbers, underscore or hyphen)');
  return { account: profile, service: 'ar.somoscria.gateway.' + createHash('sha256').update(url.href).digest('hex') };
}

function execute(command, args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume(); // Native errors can contain sensitive details; never relay them.
    child.stdin.on('error', () => {});
    child.once('error', () => reject(new Error('OS credential store could not be started')));
    child.once('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('OS credential store rejected the operation; check enrollment and permissions')));
    child.stdin.end(input);
  });
}

export async function credentialStore(action, endpoint, profile, token) {
  const { account, service } = credentialScope(endpoint, profile);
  if (action === 'write' && !/^cria_[a-f0-9]{64}$/.test(token ?? '')) throw new Error('Invalid CRIA credential format');
  if (process.platform === 'darwin') {
    if (action === 'read') return execute('/usr/bin/security', ['find-generic-password', '-a', account, '-s', service, '-w']);
    if (action === 'delete') return execute('/usr/bin/security', ['delete-generic-password', '-a', account, '-s', service]);
    // Interactive stdin avoids putting the secret in argv or shell history. All fields are constrained.
    await execute('/usr/bin/security', ['-i'], `add-generic-password -U -a ${account} -s ${service} -w ${token}\n`);
    // security -i may exit successfully even if a subcommand failed.
    if (await credentialStore('read', endpoint, profile) !== token) throw new Error('Credential store verification failed');
    return;
  }
  if (process.platform === 'win32') {
    return execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./windows-credential-store.ps1', import.meta.url)), action, `${service}:${account}`], action === 'write' ? token + '\n' : '');
  }
  throw new Error('Supported credential stores: macOS Keychain and Windows Credential Manager');
}
