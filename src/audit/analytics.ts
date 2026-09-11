import type { PublicGatewayConfiguration } from "../access/configuration.js";
import type { AuditEvent } from "./audit.js";

export interface UserActivity { userId: string; totalRequests: number; allowed: number; denied: number; errors: number; lastSeenAt?: string; topMcpServerId?: string; }
export interface McpUsage { mcpServerId: string; totalCalls: number; allowed: number; denied: number; errors: number; lastUsedAt?: string; topTool?: string; }
export interface AnalyticsSnapshot { sampleSize: number; users: readonly UserActivity[]; mcpServers: readonly McpUsage[]; }

interface MutableUserStats { total: number; allowed: number; denied: number; errors: number; lastSeenAt?: string; mcpCounts: Map<string, number>; }
interface MutableMcpStats { total: number; allowed: number; denied: number; errors: number; lastUsedAt?: string; toolCounts: Map<string, number>; }

export function computeAnalytics(events: readonly AuditEvent[], config: PublicGatewayConfiguration): AnalyticsSnapshot {
  const userStats = new Map<string, MutableUserStats>();
  const mcpStats = new Map<string, MutableMcpStats>();
  const ensureUser = (id: string): MutableUserStats => { let stats = userStats.get(id); if (!stats) { stats = { total: 0, allowed: 0, denied: 0, errors: 0, mcpCounts: new Map() }; userStats.set(id, stats); } return stats; };
  const ensureMcp = (id: string): MutableMcpStats => { let stats = mcpStats.get(id); if (!stats) { stats = { total: 0, allowed: 0, denied: 0, errors: 0, toolCounts: new Map() }; mcpStats.set(id, stats); } return stats; };

  for (const user of config.users) ensureUser(user.id);
  for (const server of config.mcpServers) ensureMcp(server.id);

  for (const event of events) {
    if (event.clientId) {
      const stats = ensureUser(event.clientId);
      bump(stats, event.decision);
      if (!stats.lastSeenAt || event.at > stats.lastSeenAt) stats.lastSeenAt = event.at;
      if (event.mcpServerId && event.mcpServerId !== "gateway") increment(stats.mcpCounts, event.mcpServerId);
    }
    if (event.mcpServerId && event.mcpServerId !== "gateway") {
      const stats = ensureMcp(event.mcpServerId);
      bump(stats, event.decision);
      if (!stats.lastUsedAt || event.at > stats.lastUsedAt) stats.lastUsedAt = event.at;
      const tool = toolNameOf(event);
      if (tool) increment(stats.toolCounts, tool);
    }
  }

  const users = [...userStats.entries()]
    .map(([userId, s]) => ({ userId, totalRequests: s.total, allowed: s.allowed, denied: s.denied, errors: s.errors, lastSeenAt: s.lastSeenAt, topMcpServerId: topOf(s.mcpCounts) }))
    .sort((a, b) => b.totalRequests - a.totalRequests);
  const mcpServers = [...mcpStats.entries()]
    .map(([mcpServerId, s]) => ({ mcpServerId, totalCalls: s.total, allowed: s.allowed, denied: s.denied, errors: s.errors, lastUsedAt: s.lastUsedAt, topTool: topOf(s.toolCounts) }))
    .sort((a, b) => b.totalCalls - a.totalCalls);

  return { sampleSize: events.length, users, mcpServers };
}

function bump(stats: { allowed: number; denied: number; errors: number; total: number }, decision: AuditEvent["decision"]) {
  stats.total += 1;
  if (decision === "allowed") stats.allowed += 1;
  else if (decision === "denied") stats.denied += 1;
  else stats.errors += 1;
}

function toolNameOf(event: AuditEvent): string | undefined {
  if (event.rpcMethod !== "tools/call") return undefined;
  const params = event.params as { name?: unknown } | undefined;
  return typeof params?.name === "string" ? params.name : undefined;
}

function increment(counts: Map<string, number>, key: string) { counts.set(key, (counts.get(key) ?? 0) + 1); }
function topOf(counts: Map<string, number>): string | undefined {
  let top: string | undefined; let max = 0;
  for (const [key, count] of counts) if (count > max) { max = count; top = key; }
  return top;
}
