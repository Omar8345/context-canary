import { oldContext, newContext, tests, demoSemanticMatches } from './fixtures.js';

export function extractPolicy(text) {
  const days = Number(text.match(/within\s+(\d+)\s+days/i)?.[1]);
  if (!Number.isFinite(days) || days < 1) throw new Error('No return window found in context');
  return { days, receiptRequired: /original receipt/i.test(text) };
}

export function expectedForContext(test, context) {
  const policy = extractPolicy(context.text);
  switch (test.assertion.kind) {
    case 'days': return `${policy.days} days`;
    case 'eligibleOnDay': return policy.days >= test.assertion.value ? 'Yes' : 'No';
    case 'receipt': return policy.receiptRequired ? 'Yes' : 'No';
    default: return test.assertion.value;
  }
}

export function evaluate(test, context, agentAnswer) {
  const expected = expectedForContext(test, context);
  const actual = agentAnswer ?? expected;
  return { actual, expected, passed: actual === expected, matchesLegacyExpectation: actual === test.expected };
}

export function runRegression({ semanticMatches = demoSemanticMatches, source = 'fixture', suite = tests, agentAnswers = {} } = {}) {
  const threshold = 0.35;
  const explicit = new Set(suite.filter(t => t.dependencyIds.includes('returns-policy')).map(t => t.id));
  const semantic = new Map(semanticMatches.filter(m => m.distance <= threshold).map(m => [m.id, m.distance]));
  const selected = suite.filter(t => explicit.has(t.id) || semantic.has(t.id));
  const results = selected.map(test => {
    const before = evaluate(test, oldContext, agentAnswers[test.id]?.before);
    const after = evaluate(test, newContext, agentAnswers[test.id]?.after);
    const expectationChanged = before.expected !== after.expected;
    const impact = !after.passed
      ? 'regression'
      : expectationChanged && after.expected !== test.expected
        ? 'stale_expectation'
        : 'stable';
    return {
      id: test.id, name: test.name, question: test.question, expected: test.expected,
      selection: [explicit.has(test.id) && 'dependency', semantic.has(test.id) && 'semantic'].filter(Boolean),
      distance: semantic.get(test.id) ?? null,
      before, after, impact,
      explanation: impact === 'regression'
        ? `The v2 answer is ${after.actual}, but the updated policy requires ${after.expected}. This is a genuine answer regression.`
        : impact === 'stale_expectation'
          ? `The answer correctly changed from ${before.actual} to ${after.actual}. The stored expectation is still ${test.expected} and should be updated to ${after.expected}.`
          : `The policy change does not alter this assertion; ${after.actual} remains correct in both versions.`
    };
  });
  const regressionCount = results.filter(r => r.impact === 'regression').length;
  const staleExpectationCount = results.filter(r => r.impact === 'stale_expectation').length;
  return {
    runId: `run-${Date.now()}`,
    source, changedDependency: 'returns-policy',
    change: { field: 'returnWindowDays', before: 30, after: 14 },
    threshold, totalTests: suite.length, selectedCount: results.length,
    regressionCount, staleExpectationCount,
    results, oldContext, newContext
  };
}
