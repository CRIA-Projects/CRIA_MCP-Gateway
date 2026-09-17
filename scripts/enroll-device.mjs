import { credentialScope, credentialStore } from './credential-store.mjs';

// Only URL and profile are arguments. The secret is entered in a hidden terminal prompt.
const [endpoint, profile, action = 'write'] = process.argv.slice(2);
try {
  credentialScope(endpoint, profile);
  if (action === 'delete') {
    await credentialStore('delete', endpoint, profile);
    console.log('Local credential removed. Revoke it in the HUB as well.');
  } else {
    if (action !== 'write') throw new Error('Usage: node scripts/enroll-device.mjs https://gateway/mcp profile [delete]');
    const token = await hiddenInput();
    await credentialStore('write', endpoint, profile, token);
    console.log('Credential stored and ready. Configure CRIA_GATEWAY_URL and CRIA_CREDENTIAL_PROFILE in Claude.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }

function hiddenInput() {
  if (!process.stdin.isTTY) throw new Error('Run enrollment in an interactive terminal; never pass the key as an argument');
  process.stderr.write('Device key (hidden): ');
  return new Promise((resolve, reject) => {
    let value = '';
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
    const finish = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stderr.write('\n'); };
    const onData = chunk => {
      for (const c of chunk) {
        if (c === '\u0003') { finish(); reject(new Error('Enrollment cancelled')); return; }
        if (c === '\r' || c === '\n') { finish(); resolve(value); return; }
        if (c === '\u007f' || c === '\b') value = value.slice(0,-1);
        else if (value.length < 128) value += c;
      }
    };
    process.stdin.on('data', onData);
  });
}
