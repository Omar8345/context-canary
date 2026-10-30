import { tests, newContext } from './fixtures.js';
import { vectorize } from './vectorizer.js';

const env = process.env;
export const configured = Boolean(env.APPWRITE_ENDPOINT && env.APPWRITE_PROJECT_ID && env.APPWRITE_API_KEY);
const ids = {
  tables: env.APPWRITE_TABLES_DB_ID || 'context_canary_tables',
  vectors: env.APPWRITE_VECTORS_DB_ID || 'context_canary_vectors',
  tests: env.APPWRITE_TESTS_TABLE_ID || 'canary_tests',
  runs: env.APPWRITE_RUNS_TABLE_ID || 'canary_runs',
  intents: env.APPWRITE_VECTOR_COLLECTION_ID || 'test_intents'
};

export class AppwriteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AppwriteError';
    this.status = status;
  }
}

export async function request(method, path, body) {
  if (!configured) throw new AppwriteError(503, 'Appwrite is not configured. Add endpoint, project ID, and API key to .env.');
  let response;
  try {
    response = await fetch(`${env.APPWRITE_ENDPOINT.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'X-Appwrite-Project': env.APPWRITE_PROJECT_ID,
        'X-Appwrite-Key': env.APPWRITE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new AppwriteError(503, 'Cannot reach Appwrite. Check the endpoint and server.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'Appwrite access denied. Check the project ID, API key, and scopes.'
      : response.status === 404
        ? 'Appwrite resource missing. Run setup:appwrite.'
        : response.status === 409
          ? 'Appwrite resource already exists.'
          : response.status >= 500
            ? 'Appwrite service unavailable.'
            : `Appwrite request failed (${response.status}).`;
    throw new AppwriteError(response.status, message);
  }
  return data;
}

export async function loadTests() {
  const result = await request('GET', `/tablesdb/${ids.tables}/tables/${ids.tests}/rows`);
  if (!Array.isArray(result.rows) || result.rows.length === 0) {
    throw new AppwriteError(503, 'No Appwrite tests found. Run setup:appwrite.');
  }
  return result.rows.map(row => ({
    id: row.$id, name: row.name, question: row.question, expected: row.expected,
    dependencyIds: JSON.parse(row.dependencyIdsJson), intent: row.intent,
    assertion: JSON.parse(row.assertionJson)
  }));
}

export async function semanticMatches(count = tests.length) {
  const vector = vectorize(newContext.text);
  const queries = [JSON.stringify({ method: 'vectorCosine', attribute: 'embeddings', values: [vector] }), JSON.stringify({ method: 'limit', values: [count] })];
  const result = await request('POST', `/vectorsdb/${ids.vectors}/collections/${ids.intents}/documents/query`, { queries });
  if (!Array.isArray(result.documents) || result.documents.length === 0) {
    throw new AppwriteError(503, 'No VectorsDB matches found. Check that the vector index and test documents are ready.');
  }
  const matches = result.documents.map(d => ({ id: d.metadata?.testId, distance: d.$distance }))
    .filter(match => typeof match.id === 'string' && Number.isFinite(match.distance));
  if (matches.length === 0) throw new AppwriteError(503, 'VectorsDB returned invalid match data.');
  return matches;
}

export async function persistRun(run) {
  const base = `/tablesdb/${ids.tables}/tables/${ids.runs}/rows`;
  return request('POST', base, {
    rowId: run.runId,
    data: {
      source: run.source,
      selectedCount: run.selectedCount,
      regressionCount: run.regressionCount,
      changeBefore: run.change.before,
      changeAfter: run.change.after,
      resultsJson: JSON.stringify(run.results),
      createdAt: new Date().toISOString()
    }
  });
}

export async function listRuns() {
  const result = await request('GET', `/tablesdb/${ids.tables}/tables/${ids.runs}/rows?queries[]=${encodeURIComponent(JSON.stringify({ method: 'limit', values: [20] }))}`);
  return result.rows.map(row => ({ id: row.$id, source: row.source, selectedCount: row.selectedCount, regressionCount: row.regressionCount, createdAt: row.createdAt }));
}

export { ids };
