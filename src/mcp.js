import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadEnv } from './env.js';
import { createMcpServer } from './mcp-tools.js';

await loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const adapter = await import('./appwrite.js');
serveStdio(() => createMcpServer(adapter, {
  allowAuditWrites: process.env.MCP_ALLOW_AUDIT_WRITES === 'true'
}));
