import { runRegression } from './engine.js';

export async function analyzeKnowledgeChange(adapter) {
  const suite = await adapter.loadTests();
  const semanticMatches = await adapter.semanticMatches(suite.length);
  const report = runRegression({ suite, semanticMatches, source: 'appwrite-vectorsdb' });
  report.vectorization = {
    method: 'deterministic-concept-v1',
    scope: 'Returns-policy vocabulary only; this is not a general-purpose embedding model.'
  };
  return report;
}

export async function runConnectedRegression(adapter) {
  const report = await analyzeKnowledgeChange(adapter);
  await adapter.persistRun(report);
  return report;
}
