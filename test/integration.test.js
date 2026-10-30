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
  assert.equal(report.regressionCount, 3);
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

test('Appwrite errors are safe to show without exposing server responses', async () => {
  const prior = {
    APPWRITE_ENDPOINT: process.env.APPWRITE_ENDPOINT,
    APPWRITE_PROJECT_ID: process.env.APPWRITE_PROJECT_ID,
    APPWRITE_API_KEY: process.env.APPWRITE_API_KEY,
    fetch: globalThis.fetch
  };
  process.env.APPWRITE_ENDPOINT = 'http://example.invalid/v1';
  process.env.APPWRITE_PROJECT_ID = 'test-project';
  process.env.APPWRITE_API_KEY = 'test-key';
  try {
    const { request } = await import('../src/appwrite.js?error-test');
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: 'sensitive server detail' }) });
    await assert.rejects(request('GET', '/tablesdb'), error =>
      error.status === 401 && /access denied/.test(error.message) && !/sensitive/.test(error.message));
    globalThis.fetch = async () => { throw new Error('private endpoint detail'); };
    await assert.rejects(request('GET', '/tablesdb'), error =>
      error.status === 503 && /Cannot reach Appwrite/.test(error.message) && !/private endpoint/.test(error.message));
  } finally {
    globalThis.fetch = prior.fetch;
    for (const key of ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY']) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});
