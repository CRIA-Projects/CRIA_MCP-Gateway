// Run on the user's VPN-connected computer, not inside the server container.
import { createInterface } from "node:readline";

import { credentialScope, credentialStore } from "./credential-store.mjs";

async function rpcReply(response, id) {
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Missing RPC response");
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop();
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        const message = JSON.parse(data);
        if (message.jsonrpc === "2.0" && message.id === id && ("result" in message || "error" in message)) return message;
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
}

export async function runBridge({ env = process.env, input = process.stdin, output = process.stdout, log = console.error, readCredential = credentialStore, request = fetch } = {}) {
  const endpoint = new URL(env.CRIA_GATEWAY_URL ?? "");
  const profile = env.CRIA_CREDENTIAL_PROFILE;
  credentialScope(endpoint, profile);
  let token;
  try {
    token = await readCredential("read", endpoint, profile);
    if (!/^cria_[a-f0-9]{64}$/.test(token)) throw new Error("Invalid credential");
  } catch { throw new Error("CRIA credential unavailable. Ask Systems to enroll this device for this gateway URL and profile."); }

async function forward(line) {
  let message;
  try { message = JSON.parse(line); }
  catch { output.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n"); return; }
  try {
    const response = await request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
      body: JSON.stringify(message), signal: AbortSignal.timeout(60_000), redirect: "error"
    });
    if (!response.ok) { log(`CRIA gateway HTTP ${response.status}; 401: check expiry/revocation, 403: check permissions`); throw new Error("HTTP failure"); }
    if (message.id === undefined) { await response.body?.cancel(); return; }
    const reply = await rpcReply(response, message.id);
    if (reply.jsonrpc !== "2.0" || reply.id !== message.id) throw new Error("Mismatched RPC response");
    output.write(JSON.stringify(reply) + "\n");
  } catch {
    log("CRIA VPN bridge request failed; check VPN, endpoint and gateway logs");
    if (message?.id !== undefined) output.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "CRIA gateway request failed" } }) + "\n");
  }
}

// Serialize input to preserve initialize/initialized order; stdout is MCP only.
for await (const line of createInterface({ input, crlfDelay: Infinity })) {
  if (line.trim()) await forward(line);
}

}

// Importing the runner for tests does not access native credentials or start stdin.
import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runBridge(); }
  catch { console.error("CRIA startup failed: use HTTPS, a valid credential profile, and enroll the device in the OS credential store."); process.exitCode = 1; }
}
