import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from '../../src/mcp-tools.js';
import { tests, demoSemanticMatches } from '../../src/fixtures.js';
const adapter = {
  loadTests: async () => { if (process.env.MCP_TEST_FAILURE) throw new Error('private-secret'); return tests; },
  semanticMatches: async () => demoSemanticMatches,
  persistRun: async () => {},
  listRuns: async () => []
};
serveStdio(() => createMcpServer(adapter, { allowAuditWrites: process.env.MCP_ALLOW_AUDIT_WRITES === 'true' }));
