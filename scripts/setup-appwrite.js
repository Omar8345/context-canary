import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VectorsDBIndexType } from 'node-appwrite';
import { loadEnv } from '../src/env.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await loadEnv(root);
const { configured, ids, sdkCall, tablesDB, vectorsDB } = await import('../src/appwrite.js');
const { tests } = await import('../src/fixtures.js');
const { vectorize } = await import('../src/vectorizer.js');
if (!configured) throw new Error('Fill in APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY in .env first.');

async function ensure(operation) {
  try { return await sdkCall(operation, 30000); }
  catch (e) { if (e.status === 409) return null; throw e; }
}

await ensure(() => tablesDB.create({ databaseId: ids.tables, name: 'Context Canary audit', description: 'Regression tests and run history' }));
await ensure(() => vectorsDB.create({ databaseId: ids.vectors, name: 'Context Canary vectors', description: 'Semantic test intent index' }));
await ensure(() => tablesDB.createTable({
  databaseId: ids.tables,
  tableId: ids.tests, name: 'Canary tests', columns: [
    { key: 'name', type: 'varchar', size: 120, required: true },
    { key: 'question', type: 'text', required: true },
    { key: 'expected', type: 'varchar', size: 80, required: true },
    { key: 'dependencyIdsJson', type: 'text', required: true },
    { key: 'intent', type: 'text', required: true },
    { key: 'assertionJson', type: 'text', required: true }
  ]
}));
await ensure(() => tablesDB.createTable({
  databaseId: ids.tables,
  tableId: ids.runs, name: 'Regression runs', columns: [
    { key: 'source', type: 'varchar', size: 40, required: true },
    { key: 'selectedCount', type: 'integer', required: true },
    { key: 'regressionCount', type: 'integer', required: true },
    { key: 'changeBefore', type: 'integer', required: true },
    { key: 'changeAfter', type: 'integer', required: true },
    { key: 'resultsJson', type: 'longtext', required: true },
    { key: 'createdAt', type: 'datetime', required: true }
  ]
}));
await ensure(() => vectorsDB.createCollection({
  databaseId: ids.vectors,
  collectionId: ids.intents, name: 'Test intents', dimension: 768
}));
await ensure(() => vectorsDB.createIndex({
  databaseId: ids.vectors, collectionId: ids.intents,
  key: 'embeddings_cosine', type: VectorsDBIndexType.HnswCosine, attributes: ['embeddings']
}));
const vectors = tests.map(t => vectorize(`${t.name}. ${t.question}. ${t.intent}`));
for (let i = 0; i < tests.length; i++) {
  const test = tests[i];
  await sdkCall(() => tablesDB.upsertRow({
    databaseId: ids.tables, tableId: ids.tests, rowId: test.id,
    data: {
      name: test.name, question: test.question, expected: test.expected,
      dependencyIdsJson: JSON.stringify(test.dependencyIds), intent: test.intent,
      assertionJson: JSON.stringify(test.assertion)
    }
  }), 30000);
  await sdkCall(() => vectorsDB.upsertDocument({
    databaseId: ids.vectors, collectionId: ids.intents, documentId: test.id,
    data: { embeddings: vectors[i], metadata: { testId: test.id, name: test.name, intent: test.intent } }
  }), 30000);
}
console.log(`Appwrite ready: ${tests.length} tests in TablesDB and VectorsDB.`);
