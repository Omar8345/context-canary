const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
let tests = [];
let appwriteMode = false;

async function getJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function setConnection(state, label) {
  $('#connection').className = `connection ${state}`;
  $('#mode').textContent = label;
}

function showToast(message, kind = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast visible ${kind}`;
  window.setTimeout(() => { toast.className = 'toast'; }, 3600);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function distanceLabel(distance) {
  return Number.isFinite(distance) ? `<span class="distance">distance ${distance.toFixed(3)}</span>` : '';
}

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function renderImpact(report) {
  const resultsById = new Map(report.results.map(result => [result.id, result]));
  $('#selection-summary').textContent = `${report.selectedCount} of ${report.totalTests} tests selected`;
  $('#impact').className = 'impact-grid';
  $('#impact').innerHTML = tests.map(test => {
    const result = resultsById.get(test.id);
    const tags = result
      ? result.selection.map(type => `<span class="tag ${type}">${type === 'semantic' ? 'VECTOR MATCH' : 'DIRECT LINK'}</span>`).join('')
      : '<span class="tag excluded">NOT SELECTED</span>';
    return `<article class="impact-card ${result ? 'selected' : 'muted'}"><div class="impact-meta"><span class="test-id">${escapeHtml(test.id)}</span>${distanceLabel(result?.distance)}</div><h3>${escapeHtml(test.name)}</h3><p>${escapeHtml(test.question)}</p><div class="tags">${tags}</div></article>`;
  }).join('');
}

function renderReport(report) {
  const regressionCount = count(report.regressionCount);
  const staleExpectationCount = count(report.staleExpectationCount);
  $('#count').className = `count ${regressionCount ? 'danger' : staleExpectationCount ? 'warning' : 'clear'}`;
  $('#count').textContent = `${staleExpectationCount} STALE EXPECTATIONS · ${regressionCount} REGRESSIONS · ${count(report.selectedCount)} REPLAYED`;
  $('#results').className = 'report';
  $('#results').innerHTML = report.results.map(result => {
    const changed = result.before.actual !== result.after.actual;
    const impact = ['regression', 'stale_expectation', 'stable'].includes(result.impact) ? result.impact : 'regression';
    const label = impact === 'stale_expectation' ? 'STALE EXPECTATION' : impact.toUpperCase();
    const afterStatus = result.after.passed ? (impact === 'stale_expectation' ? 'CORRECT · UPDATE TEST' : 'PASS') : 'FAIL';
    const icon = impact === 'stable' ? '✓' : impact === 'stale_expectation' ? '↻' : '!';
    return `<article class="report-row ${impact}"><div class="report-head"><span class="test-id">${escapeHtml(result.id)}</span><strong>${escapeHtml(result.name)}</strong><span class="badge ${impact}">${label}</span></div><p class="question">${escapeHtml(result.question)}</p><div class="answers"><div class="answer before-answer"><span>BEFORE · v1</span><strong>${escapeHtml(result.before.actual)}</strong><i>${result.before.passed ? 'PASS' : 'FAIL'}</i></div><div class="answer-arrow ${changed ? 'changed' : ''}" aria-hidden="true">→</div><div class="answer after-answer ${result.after.passed ? 'passed' : 'failed'}"><span>AFTER · v2</span><strong>${escapeHtml(result.after.actual)}</strong><i>${afterStatus}</i></div></div><div class="explanation"><span aria-hidden="true">${icon}</span><p>${escapeHtml(result.explanation)}</p></div></article>`;
  }).join('');
}

function renderHistory(runs) {
  const sorted = [...runs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('#history-summary').textContent = `${sorted.length} saved ${sorted.length === 1 ? 'run' : 'runs'}`;
  if (!sorted.length) {
    $('#history').innerHTML = '<div class="history-empty">No audit records yet. Your first successful run will appear here.</div>';
    return;
  }
  $('#history').innerHTML = sorted.slice(0, 6).map((run, index) => {
    const source = run.source === 'appwrite-vectorsdb' ? 'VectorsDB → TablesDB' : 'Local fixture';
    const metrics = run.classificationVersion === 1
      ? `<div class="history-stat"><strong>—</strong><small>stale tests</small></div><div class="history-stat legacy"><strong>${count(run.regressionCount)}</strong><small>legacy alerts</small></div>`
      : `<div class="history-stat"><strong>${count(run.staleExpectationCount)}</strong><small>stale tests</small></div><div class="history-stat regressions"><strong>${count(run.regressionCount)}</strong><small>regressions</small></div>`;
    return `<article class="history-row ${index === 0 ? 'latest' : ''}"><span class="history-status"><i></i>${index === 0 ? 'LATEST' : 'SAVED'}</span><div><strong>${escapeHtml(run.id)}</strong><small>${formatDate(run.createdAt)}</small></div>${metrics}<span class="history-source">${source}</span></article>`;
  }).join('');
}

function renderError(message) {
  $('#results').className = 'error-state';
  $('#results').innerHTML = `<span>!</span><div><strong>Analysis could not complete</strong><p>${escapeHtml(message)}</p></div>`;
  $('#count').className = 'count danger';
  $('#count').textContent = 'RUN FAILED';
  setConnection('error', 'APPWRITE NEEDS ATTENTION');
  showToast(message, 'error');
}

async function refreshHistory() {
  const { runs } = await getJson('/api/runs');
  renderHistory(runs);
}

async function initialize() {
  const button = $('#run');
  try {
    const status = await getJson('/api/status');
    const testData = await getJson('/api/tests');
    const historyData = await getJson('/api/runs');
    tests = testData.tests;
    appwriteMode = status.mode === 'appwrite-ready';
    $('#suite-size').textContent = tests.length;
    renderHistory(historyData.runs);
    setConnection(appwriteMode ? 'connected' : 'local', appwriteMode ? 'APPWRITE CONNECTED' : 'LOCAL FIXTURE MODE');
    button.disabled = false;
  } catch (error) {
    setConnection('error', 'APPWRITE UNAVAILABLE');
    renderError(error.message);
  }
}

$('#run').addEventListener('click', async () => {
  const button = $('#run');
  const label = button.querySelector('.button-label');
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.classList.add('running');
  label.textContent = 'Querying VectorsDB…';
  $('#selection-summary').textContent = 'Searching test intent vectors…';
  try {
    const report = await getJson('/api/run', { method: 'POST' });
    renderImpact(report);
    renderReport(report);
    await refreshHistory();
    setConnection(appwriteMode ? 'connected' : 'local', appwriteMode ? 'APPWRITE CONNECTED' : 'LOCAL FIXTURE MODE');
    showToast(`${appwriteMode ? 'Run saved' : 'Local run complete'} · ${count(report.staleExpectationCount)} stale expectations · ${count(report.regressionCount)} regressions`);
    $('#impact-stage').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    renderError(error.message);
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('running');
    label.textContent = 'Run impact analysis';
  }
});

initialize();
