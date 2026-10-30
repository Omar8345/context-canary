import test from 'node:test';
import assert from 'node:assert/strict';

test('history requests newest createdAt first before applying its 20-row limit', async () => {
  const keys = ['APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY'];
  const prior = keys.map(key => process.env[key]);
  process.env.APPWRITE_ENDPOINT = 'http://example.invalid/v1';
  process.env.APPWRITE_PROJECT_ID = 'test';
  process.env.APPWRITE_API_KEY = 'test';
  try {
    const adapter = await import('../src/appwrite.js?history-test');
    const rows = Array.from({ length: 25 }, (_, index) => ({
      $id: `run-${index}`, createdAt: new Date(2026, 0, index + 1).toISOString(),
      resultsJson: '[]', selectedCount: 4, regressionCount: 0
    }));
    adapter.tablesDB.listRows = async params => {
      const queries = params.queries.map(query => JSON.parse(query));
      assert.deepEqual(queries, [
        { method: 'orderDesc', attribute: 'createdAt' },
        { method: 'limit', values: [20] }
      ]);
      return { rows: [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20) };
    };
    const history = await adapter.listRuns();
    assert.equal(history.length, 20);
    assert.equal(history[0].id, 'run-24');
    assert.equal(history.at(-1).id, 'run-5');
  } finally {
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
  }
});
