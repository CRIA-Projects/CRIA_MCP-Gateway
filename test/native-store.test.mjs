import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { credentialStore } from '../scripts/credential-store.mjs';

test('native credential store writes, reads, isolates endpoints and deletes', { skip: process.env.CRIA_TEST_NATIVE_STORE !== '1' }, async () => {
  const endpoint = 'https://cria-credential-test.invalid/mcp', profile = 'test-' + randomUUID();
  const token = 'cria_' + randomBytes(32).toString('hex');
  try {
    await credentialStore('write', endpoint, profile, token);
    assert.equal(await credentialStore('read', endpoint, profile), token);
    await assert.rejects(credentialStore('read', 'https://another-credential-test.invalid/mcp', profile));
  } finally { await credentialStore('delete', endpoint, profile); }
  await assert.rejects(credentialStore('read', endpoint, profile));
});
