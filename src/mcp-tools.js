import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { analyzeKnowledgeChange, runConnectedRegression } from './runner.js';

const scenario = z.literal('returns-window');
const description = 'Deterministic returns-policy scenario: 30 to 14 days. Uses real Appwrite vector matches; no live LLM.';
const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

export function createMcpServer(adapter, { allowAuditWrites = false } = {}) {
  const server = new McpServer({ name: 'context-canary', version: '0.1.0' });
  const safe = handler => async args => {
    try { return output(await handler(args)); }
    catch { return { isError: true, content: [{ type: 'text', text: 'Context Canary operation failed. Check Appwrite availability and local configuration. Audit writes are never retried automatically.' }] }; }
  };
  server.registerTool('analyze_knowledge_change', {
    description: `Read-only preview. ${description}`,
    inputSchema: z.object({ scenario }).strict(),
    annotations: { readOnlyHint: true }
  }, safe(async () => ({ persisted: false, report: await analyzeKnowledgeChange(adapter) })));
  server.registerTool('run_regression_checks', {
    description: `Analyze and persist one audit. Requires server write opt-in and confirmation. ${description}`,
    inputSchema: z.object({ scenario, confirmAuditWrite: z.literal(true) }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, safe(async () => {
    if (!allowAuditWrites) throw new Error('Writes disabled');
    return { persisted: true, report: await runConnectedRegression(adapter) };
  }));
  server.registerTool('get_audit_history', {
    description: 'Read recent TablesDB audit summaries, including legacy classification markers.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(20).default(10) }).strict(),
    annotations: { readOnlyHint: true }
  }, safe(async ({ limit }) => ({ runs: (await adapter.listRuns()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit) })));
  return server;
}
