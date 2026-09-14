// Run on the user's VPN-connected computer, not inside the server container.
import { createInterface } from "node:readline";

const endpoint = new URL(process.env.CRIA_GATEWAY_URL ?? "");
const clientId = process.env.CRIA_CLIENT_ID;
if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error("Set CRIA_GATEWAY_URL to the gateway HTTP(S) endpoint");
if (!clientId || !/^[a-z0-9][a-z0-9-_]{0,62}$/.test(clientId)) throw new Error("Set CRIA_CLIENT_ID to the existing HUB user ID");

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

async function forward(line) {
  let message;
  try { message = JSON.parse(line); }
  catch { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n"); return; }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-client-id": clientId },
      body: JSON.stringify(message), signal: AbortSignal.timeout(60_000), redirect: "error"
    });
    if (!response.ok) throw new Error("HTTP failure");
    if (message.id === undefined) { await response.body?.cancel(); return; }
    const reply = await rpcReply(response, message.id);
    if (reply.jsonrpc !== "2.0" || reply.id !== message.id) throw new Error("Mismatched RPC response");
    process.stdout.write(JSON.stringify(reply) + "\n");
  } catch {
    console.error("CRIA VPN bridge request failed; check VPN, endpoint and gateway logs");
    if (message?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32603, message: "CRIA gateway request failed" } }) + "\n");
  }
}

// Serialize input to preserve initialize/initialized order; stdout is MCP only.
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (line.trim()) await forward(line);
}
