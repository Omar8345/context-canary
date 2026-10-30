import test from 'node:test';
import assert from 'node:assert/strict';
import { runRegression, extractPolicy } from '../src/engine.js';
import { oldContext, newContext } from '../src/fixtures.js';
import { vectorize } from '../src/vectorizer.js';

test('policy change is parsed deterministically', () => {
  assert.equal(extractPolicy(oldContext.text).days, 30);
  assert.equal(extractPolicy(newContext.text).days, 14);
});

test('impact selection finds explicit and semantic dependencies, not shipping', () => {
  const result = runRegression();
  assert.equal(result.selectedCount, 4);
  assert.equal(result.regressionCount, 0);
  assert.equal(result.staleExpectationCount, 3);
  assert.deepEqual(result.results.map(r => r.id), ['T-101', 'T-102', 'T-103', 'T-104']);
  assert.deepEqual(result.results.find(r => r.id === 'T-103').selection, ['semantic']);
  assert.equal(result.results.find(r => r.id === 'T-104').impact, 'stable');
  assert.equal(result.results.find(r => r.id === 'T-101').impact, 'stale_expectation');
  assert.equal(result.results.find(r => r.id === 'T-101').after.passed, true);
});

test('an answer that violates the new policy is a genuine regression', () => {
  const result = runRegression({ agentAnswers: { 'T-101': { after: '30 days' } } });
  assert.equal(result.regressionCount, 1);
  assert.equal(result.staleExpectationCount, 2);
  assert.equal(result.results.find(r => r.id === 'T-101').impact, 'regression');
  assert.equal(result.results.find(r => r.id === 'T-101').after.expected, '14 days');
});

test('local concept vectors rank the refund FAQ above unrelated shipping', () => {
  const changed = vectorize(newContext.text);
  const refund = vectorize('time limit for a full refund when an item is sent back');
  const shipping = vectorize('shipping fulfillment time');
  const similarity = vector => changed.reduce((sum, value, index) => sum + value * vector[index], 0);
  assert.ok(similarity(refund) > similarity(shipping));
  assert.equal(changed.length, 768);
});
