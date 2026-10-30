import test from 'node:test';
import assert from 'node:assert/strict';
import { runConnectedRegression } from '../src/runner.js';
import { tests, demoSemanticMatches } from '../src/fixtures.js';

test('connected run uses live matches and persists the report', async () => {
  let saved;
  const adapter = {
    loadTests: async () => tests,
    semanticMatches: async () => demoSemanticMatches,
    persistRun: async report => { saved = report; }
  };
  const report = await runConnectedRegression(adapter);
  assert.equal(report.source, 'appwrite-vectorsdb');
  assert.equal(report.vectorization.method, 'deterministic-concept-v1');
  assert.equal(report.regressionCount, 0);
  assert.equal(report.staleExpectationCount, 3);
  assert.equal(saved, report);
});

test('vector query failure stops the run before persistence', async () => {
  let persisted = false;
  const adapter = {
    loadTests: async () => tests,
    semanticMatches: async () => { throw new Error('vector unavailable'); },
    persistRun: async () => { persisted = true; }
  };
  await assert.rejects(runConnectedRegression(adapter), /vector unavailable/);
  assert.equal(persisted, false);
});

test('persistence failure cannot be reported as a successful run', async () => {
  const adapter = {
    loadTests: async () => tests,
    semanticMatches: async () => demoSemanticMatches,
    persistRun: async () => { throw new Error('audit write failed'); }
  };
  await assert.rejects(runConnectedRegression(adapter), /audit write failed/);
});

test('Appwrite SDK errors are safe to show without exposing server responses', async () => {
  const { normalizeAppwriteError } = await import('../src/appwrite.js');
  const denied = normalizeAppwriteError({ code: 401, message: 'sensitive server detail' });
  assert.equal(denied.status, 401);
  assert.match(denied.message, /access denied/);
  assert.doesNotMatch(denied.message, /sensitive/);

  const network = normalizeAppwriteError(new Error('private endpoint detail'));
  assert.equal(network.status, 503);
  assert.match(network.message, /Cannot reach Appwrite/);
  assert.doesNotMatch(network.message, /private endpoint/);
});
