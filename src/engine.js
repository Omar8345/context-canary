import { oldContext, newContext, tests, demoSemanticMatches } from './fixtures.js';

export function extractPolicy(text) {
  const days = Number(text.match(/within\s+(\d+)\s+days/i)?.[1]);
  if (!Number.isFinite(days) || days < 1) throw new Error('No return window found in context');
  return { days, receiptRequired: /original receipt/i.test(text) };
}

export function evaluate(test, context) {
  const policy = extractPolicy(context.text);
  let actual;
  switch (test.assertion.kind) {
    case 'days': actual = `${policy.days} days`; break;
    case 'eligibleOnDay': actual = policy.days >= test.assertion.value ? 'Yes' : 'No'; break;
    case 'receipt': actual = policy.receiptRequired ? 'Yes' : 'No'; break;
    default: actual = test.assertion.value;
  }
  return { actual, passed: actual === test.expected };
}

export function runRegression({ semanticMatches = demoSemanticMatches, source = 'fixture', suite = tests } = {}) {
  const threshold = 0.35;
  const explicit = new Set(suite.filter(t => t.dependencyIds.includes('returns-policy')).map(t => t.id));
  const semantic = new Map(semanticMatches.filter(m => m.distance <= threshold).map(m => [m.id, m.distance]));
  const selected = suite.filter(t => explicit.has(t.id) || semantic.has(t.id));
  const results = selected.map(test => {
    const before = evaluate(test, oldContext);
    const after = evaluate(test, newContext);
    const impact = before.passed && !after.passed ? 'regression' : 'stable';
    return {
      id: test.id, name: test.name, question: test.question, expected: test.expected,
      selection: [explicit.has(test.id) && 'dependency', semantic.has(test.id) && 'semantic'].filter(Boolean),
      distance: semantic.get(test.id) ?? null,
      before, after, impact,
      explanation: impact === 'regression'
        ? `The return window changed from 30 to 14 days. This test still expects ${test.expected}, so the answer changed from ${before.actual} to ${after.actual}.`
        : `The changed return window does not alter this assertion; both versions answer ${after.actual}.`
    };
  });
  return {
    runId: `run-${Date.now()}`,
    source, changedDependency: 'returns-policy',
    change: { field: 'returnWindowDays', before: 30, after: 14 },
    threshold, totalTests: suite.length, selectedCount: results.length,
    regressionCount: results.filter(r => r.impact === 'regression').length,
    results, oldContext, newContext
  };
}
