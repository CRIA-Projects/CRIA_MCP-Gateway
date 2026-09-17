import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { runBridge } from '../scripts/claude-vpn-bridge.mjs';
import { credentialScope } from '../scripts/credential-store.mjs';
const token = 'cria_' + 'a'.repeat(64);
const env = { CRIA_GATEWAY_URL: 'https://gateway.test/mcp', CRIA_CREDENTIAL_PROFILE: 'laptop', CRIA_CLIENT_ID: 'forged' };

test('bridge rejects HTTP before accessing credentials and binds lookup to endpoint', async () => {
  let read = false;
  await assert.rejects(runBridge({ env: { ...env, CRIA_GATEWAY_URL: 'http://localhost:8787/mcp' }, readCredential: async () => { read = true; return token; } }), /HTTPS/);
  assert.equal(read, false);
  assert.notDeepEqual(credentialScope(env.CRIA_GATEWAY_URL, 'laptop'), credentialScope('https://other.test/mcp', 'laptop'));
  assert.throws(() => credentialScope('https://gateway.test/mcp?token=secret', 'laptop'));
});

test('bridge sends only bearer credential, serializes RPC and sanitizes failures', async () => {
  const replies = [], logs = [], calls = [];
  const input = Readable.from([
    '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n',
    '{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
    '{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n',
    '{"jsonrpc":"2.0","id":3,"method":"tools/list"}\n'
  ]);
  await runBridge({ env, input, output: { write: s => replies.push(JSON.parse(s)) }, log: s => logs.push(s),
    readCredential: async (action, url, profile) => { assert.equal(action,'read'); assert.equal(url.href,env.CRIA_GATEWAY_URL); assert.equal(profile,'laptop'); return token; },
    request: async (url, options) => {
      assert.equal(options.headers.authorization, `Bearer ${token}`);
      assert.equal(options.headers['x-client-id'], undefined);
      assert.equal(options.redirect, 'error');
      const message = JSON.parse(options.body); calls.push(message.method);
      if (!message.id) return new Response(null, { status: 202 });
      if (message.id === 3) throw new Error('sensitive detail ' + token);
      return Response.json({ jsonrpc:'2.0', id:message.id, result:{} });
    }
  });
  assert.deepEqual(calls, ['initialize','notifications/initialized','tools/list','tools/list']);
  assert.deepEqual(replies.map(r => r.id), [1,2,3]);
  assert.equal(replies[2].error.code, -32603);
  assert.ok(!JSON.stringify({ replies, logs }).includes(token));
});

test('bridge refuses missing credentials without an ID fallback', async () => {
  await assert.rejects(runBridge({ env, readCredential: async () => { throw new Error('missing'); } }), /credential unavailable/);
});
