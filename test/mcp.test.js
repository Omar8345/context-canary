import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

export async function connectMcp(env = {}, fixture = true) {
  const child = spawn(process.execPath, [fixture ? 'test/support/mcp-fixture.js' : 'src/mcp.js'], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', next = 0;
  const pending = new Map();
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    }
  });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP response timeout')); }, 45000);
    pending.set(id, message => { clearTimeout(timer); resolve(message); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'canary-test', version: '1' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return { request, close: () => child.kill() };
}

test('MCP discovery, validation, write gating, preview and safe failures', async () => {
  const client = await connectMcp();
  try {
    const listed = await client.request('tools/list');
    assert.equal(listed.result.tools.length, 3);
    const call = (name, args) => client.request('tools/call', { name, arguments: args });
    const preview = await call('analyze_knowledge_change', { scenario: 'returns-window' });
    assert.equal(preview.result.structuredContent.persisted, false);
    assert.equal(preview.result.structuredContent.report.staleExpectationCount, 3);
    assert.ok((await call('run_regression_checks', { scenario: 'returns-window', confirmAuditWrite: true })).result.isError);
    const invalid = await call('get_audit_history', { limit: 100 });
    assert.ok(invalid.error || invalid.result?.isError);
    const missing = await call('run_regression_checks', { scenario: 'returns-window' });
    assert.ok(missing.error || missing.result?.isError);
  } finally { client.close(); }
  const enabled = await connectMcp({ MCP_ALLOW_AUDIT_WRITES: 'true' });
  try {
    const result = await enabled.request('tools/call', { name: 'run_regression_checks', arguments: { scenario: 'returns-window', confirmAuditWrite: true } });
    assert.equal(result.result.structuredContent.persisted, true);
  } finally { enabled.close(); }
  const failing = await connectMcp({ MCP_TEST_FAILURE: 'true' });
  try {
    const result = await failing.request('tools/call', { name: 'analyze_knowledge_change', arguments: { scenario: 'returns-window' } });
    assert.equal(result.result.isError, true);
    assert.doesNotMatch(JSON.stringify(result), /private-secret/);
  } finally { failing.close(); }
});
