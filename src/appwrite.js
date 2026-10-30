import { Client, Query, TablesDB, VectorsDB } from 'node-appwrite';
import { tests, newContext } from './fixtures.js';
import { vectorize } from './vectorizer.js';

const env = process.env;
export const configured = Boolean(env.APPWRITE_ENDPOINT && env.APPWRITE_PROJECT_ID && env.APPWRITE_API_KEY);
export const ids = {
  tables: env.APPWRITE_TABLES_DB_ID || 'context_canary_tables',
  vectors: env.APPWRITE_VECTORS_DB_ID || 'context_canary_vectors',
  tests: env.APPWRITE_TESTS_TABLE_ID || 'canary_tests',
  runs: env.APPWRITE_RUNS_TABLE_ID || 'canary_runs',
  intents: env.APPWRITE_VECTOR_COLLECTION_ID || 'test_intents'
};

const client = new Client();
if (configured) {
  client
    .setEndpoint(env.APPWRITE_ENDPOINT.replace(/\/$/, ''))
    .setProject(env.APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY);
}

export const tablesDB = new TablesDB(client);
export const vectorsDB = new VectorsDB(client);

export class AppwriteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AppwriteError';
    this.status = status;
  }
}

function safeMessage(status) {
  if (status === 401 || status === 403) return 'Appwrite access denied. Check the project ID, API key, and scopes.';
  if (status === 404) return 'Appwrite resource missing. Run setup:appwrite.';
  if (status === 409) return 'Appwrite resource already exists.';
  if (status >= 500) return 'Appwrite service unavailable.';
  return status > 0 ? `Appwrite request failed (${status}).` : 'Cannot reach Appwrite. Check the endpoint and server.';
}

export function normalizeAppwriteError(error) {
  if (error instanceof AppwriteError) return error;
  const reportedStatus = Number(error?.code ?? error?.status);
  const status = Number.isFinite(reportedStatus) && reportedStatus > 0 ? reportedStatus : 0;
  return new AppwriteError(status || 503, safeMessage(status));
}

export async function sdkCall(operation, timeoutMs = 10000) {
  if (!configured) throw new AppwriteError(503, 'Appwrite is not configured. Add endpoint, project ID, and API key to .env.');
  let timeout;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new AppwriteError(503, 'Cannot reach Appwrite. Check the endpoint and server.')), timeoutMs);
      })
    ]);
  } catch (error) {
    throw normalizeAppwriteError(error);
  } finally {
    clearTimeout(timeout);
  }
}

// node-appwrite 31.1.0 supports TablesDB writes, but its Client does not expose
// an AbortSignal or request-timeout option. Keep this one write on direct REST so
// the client stops waiting at the transport layer. A server may still commit a
// write already received; transport cancellation does not guarantee rollback.
async function createAuditRow(run) {
  const endpoint = `${env.APPWRITE_ENDPOINT.replace(/\/$/, '')}/tablesdb/${ids.tables}/tables/${ids.runs}/rows`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'X-Appwrite-Project': env.APPWRITE_PROJECT_ID,
        'X-Appwrite-Key': env.APPWRITE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
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
      }),
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new AppwriteError(503, 'Cannot reach Appwrite. Check the endpoint and server.');
  }
  if (!response.ok) throw new AppwriteError(response.status, safeMessage(response.status));
  return response.json().catch(() => ({}));
}

export async function loadTests() {
  const result = await sdkCall(() => tablesDB.listRows({ databaseId: ids.tables, tableId: ids.tests }));
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
  const result = await sdkCall(() => vectorsDB.createQuery({
    databaseId: ids.vectors,
    collectionId: ids.intents,
    queries: [Query.vectorCosine('embeddings', vectorize(newContext.text)), Query.limit(count)]
  }));
  if (!Array.isArray(result.documents) || result.documents.length === 0) {
    throw new AppwriteError(503, 'No VectorsDB matches found. Check that the vector index and test documents are ready.');
  }
  const matches = result.documents.map(document => ({ id: document.metadata?.testId, distance: document.$distance }))
    .filter(match => typeof match.id === 'string' && Number.isFinite(match.distance));
  if (matches.length === 0) throw new AppwriteError(503, 'VectorsDB returned invalid match data.');
  return matches;
}

export async function persistRun(run) {
  if (!configured) throw new AppwriteError(503, 'Appwrite is not configured. Add endpoint, project ID, and API key to .env.');
  return createAuditRow(run);
}

export async function listRuns() {
  const result = await sdkCall(() => tablesDB.listRows({
    databaseId: ids.tables,
    tableId: ids.runs,
    queries: [Query.orderDesc('createdAt'), Query.limit(20)]
  }));
  return result.rows.map(row => {
    let staleExpectationCount = 0;
    let classificationVersion = 1;
    try {
      const results = JSON.parse(row.resultsJson);
      staleExpectationCount = results.filter(item => item.impact === 'stale_expectation').length;
      classificationVersion = results.every(item => item.after && Object.hasOwn(item.after, 'expected')) ? 2 : 1;
    } catch {
      // Legacy audit rows did not track stale expectations separately.
    }
    return {
      id: row.$id, source: row.source, selectedCount: row.selectedCount,
      regressionCount: row.regressionCount, staleExpectationCount, classificationVersion, createdAt: row.createdAt
    };
  });
}
