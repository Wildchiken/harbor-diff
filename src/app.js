import { compareHar, parseHar, toMarkdown, toPublicReport, MAX_HAR_BYTES } from './har-core.js';
import { createDemoCaptures, demoLabels } from './demo.js';

const $ = id => document.getElementById(id);
const captures = { before: null, after: null };
const revisions = { before: 0, after: 0 };
const changeLabels = { errors: 'HTTP errors', bytes: 'Heavier', duration: 'Slower', count: 'More calls', added: 'Added', removed: 'Removed' };
let result = null;
let activeFilter = 'all';
let rowLimit = 200;
let pasteSide = 'before';
let comparing = false;
let isDemo = false;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}
function known(value) { return typeof value === 'number' && Number.isFinite(value); }
function number(value) { return known(value) ? new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value) : '—'; }
function bytes(value) {
  if (!known(value)) return '—';
  if (Math.abs(value) < 1024) return `${number(value)} B`;
  if (Math.abs(value) < 1024 * 1024) return `${number(value / 1024)} KiB`;
  return `${number(value / (1024 * 1024))} MiB`;
}
function duration(value) { return known(value) ? `${number(value)} ms` : '—'; }
function signed(value, formatter = number) { return known(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatter(Math.abs(value))}` : '—'; }
function direction(value) { return !known(value) || value === 0 ? '' : value > 0 ? 'bad' : 'good'; }
function full(group, coverageKey) { return group && group[coverageKey] === group.count; }
function showFeedback(message, error = false, target = 'feedback') {
  const element = $(target);
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = !message;
}
function syncButtons() {
  $('compare-button').disabled = !captures.before || !captures.after || comparing;
  $('clear-button').hidden = !captures.before && !captures.after;
}
function renderCapture(side) {
  const capture = captures[side];
  $(`${side}-dropzone`).classList.toggle('loaded', Boolean(capture));
  $(`${side}-label`).textContent = capture ? capture.name : 'Drop a .har file here';
  $(`${side}-detail`).textContent = capture ? `${number(capture.data.entries.length)} requests · click to replace` : 'or click to choose a file · up to 25 MiB';
  $(`${side}-status`).textContent = capture ? 'Ready to compare' : 'No capture selected';
  syncButtons();
}
function hideResults() {
  result = null;
  $('results').hidden = true;
  $('request-dialog').close();
  $('metrics').replaceChildren();
  $('findings').replaceChildren();
  $('request-rows').replaceChildren();
  $('engine-notes').replaceChildren();
  $('request-detail').replaceChildren();
  $('request-title').textContent = 'Request details';
  $('request-url').textContent = '';
  $('include-urls').checked = false;
  updateExportNote();
  showFeedback('', false, 'export-feedback');
}
function storeCapture(side, input, name, source = 'file') {
  // parseHar deliberately keeps only minimal comparison fields. No HAR payloads are retained.
  const parsed = parseHar(input);
  captures[side] = { data: parsed, name, source };
  isDemo = captures.before?.source === 'demo' && captures.after?.source === 'demo';
  hideResults();
  renderCapture(side);
  showFeedback(`${side === 'before' ? 'Before' : 'After'} capture is ready. ${number(parsed.entries.length)} requests loaded.`);
}
async function readFile(side, file) {
  if (!file) return;
  const revision = ++revisions[side];
  if (file.size > MAX_HAR_BYTES) {
    showFeedback('This capture exceeds 25 MiB. Export a shorter session or remove response content before trying again.', true);
    return;
  }
  showFeedback(`Reading the ${side} capture locally…`);
  try {
    const text = await file.text();
    if (revision !== revisions[side]) return;
    storeCapture(side, text, file.name);
  } catch (error) {
    if (revision !== revisions[side]) return;
    showFeedback(error?.name === 'HarValidationError' ? error.message : 'The file could not be read. Choose an uncompressed HAR 1.2 JSON file.', true);
  }
}

for (const side of ['before', 'after']) {
  $(`${side}-file`).addEventListener('change', event => {
    const file = event.target.files?.[0];
    readFile(side, file);
    event.target.value = '';
  });
  const zone = $(`${side}-dropzone`);
  let dragDepth = 0;
  zone.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; zone.classList.add('dragover'); });
  zone.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
  zone.addEventListener('dragleave', event => { event.preventDefault(); dragDepth--; if (dragDepth <= 0) zone.classList.remove('dragover'); });
  zone.addEventListener('drop', event => {
    event.preventDefault(); dragDepth = 0; zone.classList.remove('dragover');
    const files = event.dataTransfer?.files;
    if (files?.length !== 1) { showFeedback('Drop one HAR capture into each box.', true); return; }
    readFile(side, files[0]);
  });
}

document.querySelectorAll('[data-paste]').forEach(button => button.addEventListener('click', () => {
  pasteSide = button.dataset.paste;
  $('paste-title').textContent = `Paste ${pasteSide} HAR JSON`;
  $('paste-content').value = '';
  $('paste-error').hidden = true;
  $('paste-dialog').showModal();
  $('paste-content').focus();
}));
$('close-paste').addEventListener('click', () => $('paste-dialog').close());
$('paste-dialog').addEventListener('close', () => { $('paste-content').value = ''; });
$('paste-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('paste-content').value;
  try {
    if (text.length > MAX_HAR_BYTES || new TextEncoder().encode(text).byteLength > MAX_HAR_BYTES) throw new Error('This capture exceeds the 25 MiB limit.');
    storeCapture(pasteSide, text, 'Pasted HAR');
    revisions[pasteSide]++;
    $('paste-dialog').close();
  } catch (error) {
    $('paste-error').textContent = error?.message || 'Enter a valid HAR 1.2 JSON capture.';
    $('paste-error').hidden = false;
  }
});

$('clear-button').addEventListener('click', () => {
  for (const side of ['before', 'after']) { revisions[side]++; captures[side] = null; renderCapture(side); }
  isDemo = false;
  hideResults();
  showFeedback('Captures cleared from this page.');
  $('before-file').focus();
});
function loadDemo() {
  const pair = createDemoCaptures();
  for (const side of ['before', 'after']) { revisions[side]++; storeCapture(side, pair[side], demoLabels[side], 'demo'); }
  $('ignore-params').value = '';
  $('min-bytes').value = '0';
  $('min-duration').value = '100';
  runComparison();
}
$('demo-button').addEventListener('click', loadDemo);

async function runComparison() {
  if (!captures.before || !captures.after || comparing) return;
  if (!$('min-bytes').reportValidity() || !$('min-duration').reportValidity()) return;
  comparing = true; syncButtons();
  showFeedback('Comparing the captures in this browser…');
  // Yield to paint the progress state before CPU work, without scheduling any network request.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    if (!captures.before || !captures.after) return;
    result = compareHar(captures.before.data, captures.after.data, {
      ignoreQueryParams: [...new Set($('ignore-params').value.split(',').map(value => value.trim()).filter(Boolean))],
      minByteIncrease: Number($('min-bytes').value || 0),
      minDurationIncreaseMs: Number($('min-duration').value || 0),
    });
    activeFilter = 'all'; rowLimit = 200; $('path-search').value = '';
    renderResults();
    showFeedback(isDemo ? 'Synthetic demo loaded: a larger image, repeated product calls, a new tracker, a 500 response, and slower search.' : 'Comparison ready. Expand any request group to inspect its measurements.');
    $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  } catch (error) {
    hideResults();
    showFeedback(error?.message || 'The captures could not be compared. Check that both files use HAR 1.2.', true);
  } finally { comparing = false; syncButtons(); }
}
$('compare-button').addEventListener('click', runComparison);

function addMetric(label, before, after, formatter, delta, explanation, coverage) {
  const card = node('article', 'metric');
  card.append(node('p', 'metric-label', label));
  const values = node('p', 'metric-value');
  values.append(node('span', '', formatter(before)), node('span', 'metric-arrow', '→'), node('span', '', formatter(after)));
  card.append(values, node('div', `metric-change ${direction(delta)}`, known(delta) ? `${signed(delta, formatter)} ${explanation}` : 'Change unknown / incomplete'));
  card.append(node('p', 'metric-coverage', coverage));
  $('metrics').append(card);
}
function renderResults() {
  const b = result.before, a = result.after;
  $('results').hidden = false;
  $('demo-label').hidden = !isDemo;
  $('result-lead').textContent = `${number(result.summary.flagged ?? result.summary.changed)} flagged groups out of ${number(result.summary.totalGroups)} request groups. ${number(result.summary.added)} added · ${number(result.summary.removed)} removed · ${number(result.summary.errors)} with new or increased HTTP errors.`;
  $('metrics').replaceChildren();
  addMetric('Requests recorded', b.requestCount, a.requestCount, number, a.requestCount - b.requestCount, 'requests', `${number(b.groupCount)} → ${number(a.groupCount)} distinct request groups`);
  const byteDelta = full(b, 'knownBodyBytes') && full(a, 'knownBodyBytes') && known(b.totalBodyBytes) && known(a.totalBodyBytes) ? a.totalBodyBytes - b.totalBodyBytes : null;
  addMetric('Known response body bytes', b.totalBodyBytes, a.totalBodyBytes, bytes, byteDelta, '', `Known: ${b.knownBodyBytes}/${b.count} → ${a.knownBodyBytes}/${a.count} responses`);
  const errorDelta = full(b, 'knownStatus') && full(a, 'knownStatus') ? a.errorCount - b.errorCount : null;
  addMetric('Observed HTTP errors (4xx / 5xx)', b.knownStatus ? b.errorCount : null, a.knownStatus ? a.errorCount : null, number, errorDelta, 'errors', `Known status: ${b.knownStatus}/${b.count} → ${a.knownStatus}/${a.count}`);
  const durationDelta = full(b, 'knownDuration') && full(a, 'knownDuration') && known(b.medianDurationMs) && known(a.medianDurationMs) ? a.medianDurationMs - b.medianDurationMs : null;
  addMetric('Median observed request duration', b.medianDurationMs, a.medianDurationMs, duration, durationDelta, '', `Known: ${b.knownDuration}/${b.count} → ${a.knownDuration}/${a.count} durations`);
  renderFindings(); renderTable(); updateFilters();
  $('engine-notes').replaceChildren(...result.notes.map(note => node('li', '', note)));
}

function findingDescription(request, kind) {
  const b = request.before, a = request.after;
  if (kind === 'errors') return `${number(b?.errorCount ?? 0)} → ${number(a?.errorCount ?? 0)} observed HTTP errors`;
  if (kind === 'bytes') return `${signed(request.delta.bodyBytes, bytes)} of response bodies`;
  if (kind === 'duration') return `${signed(request.delta.durationMs, duration)} median duration`;
  if (kind === 'count') return `${number(b?.count ?? 0)} → ${number(a?.count ?? 0)} requests to this endpoint`;
  if (kind === 'added') return 'New request group in this capture';
  return 'Request group absent from the after capture';
}
function renderFindings() {
  $('findings').replaceChildren();
  const selected = [];
  // Surface distinct useful observations; a request may have several simultaneous flags.
  for (const kind of ['errors', 'bytes', 'duration', 'count', 'added', 'removed']) {
    const candidate = result.requests.filter(request => request.changes.includes(kind) && !selected.some(item => item.request.id === request.id)).sort((x, y) => {
      const key = kind === 'bytes' ? 'bodyBytes' : kind === 'duration' ? 'durationMs' : kind === 'count' ? 'count' : 'errorCount';
      return (y.delta[key] ?? 0) - (x.delta[key] ?? 0);
    })[0];
    if (candidate) selected.push({ request: candidate, kind });
    if (selected.length === 3) break;
  }
  $('finding-count').textContent = selected.length ? 'A FEW PLACES TO START' : 'NO FLAGS ABOVE YOUR THRESHOLDS';
  if (!selected.length) { $('findings').append(node('div', 'finding-empty', 'No changes crossed the current thresholds. This does not prove the captures are identical; use Unflagged to inspect the remaining groups and their coverage.')); return; }
  for (const { request, kind } of selected) {
    const card = node('article', 'finding');
    const top = node('div', 'finding-top');
    top.append(node('span', 'finding-type', changeLabels[kind].toUpperCase()), node('span', 'finding-id', request.id));
    card.append(top, node('h4', '', findingDescription(request, kind)), node('p', '', `${request.method} ${request.displayUrl}`));
    const button = node('button', 'text-button', 'Inspect request →'); button.type = 'button';
    button.addEventListener('click', () => showRequest(request));
    card.append(button); $('findings').append(card);
  }
}

function filteredRequests() {
  const term = $('path-search').value.trim().toLowerCase();
  return result.requests.filter(request => {
    const matchesFilter = activeFilter === 'all' ? request.changes.length > 0 : activeFilter === 'unchanged' ? request.changes.length === 0 : request.changes.includes(activeFilter);
    return matchesFilter && (!term || `${request.method} ${request.displayUrl} ${request.id}`.toLowerCase().includes(term));
  });
}
function errorDisplay(group) {
  if (!group) return '0';
  if (!group.knownStatus) return '?';
  return `${group.errorCount}${full(group, 'knownStatus') ? '' : '*'}`;
}
function renderTable() {
  if (!result) return;
  const requests = filteredRequests();
  const fragment = document.createDocumentFragment();
  for (const request of requests.slice(0, rowLimit)) {
    const row = node('tr');
    const labelCell = node('td');
    const button = node('button', 'request-button'); button.type = 'button';
    button.append(node('span', 'request-method', request.method), node('span', '', request.displayUrl), node('span', 'request-id', request.id));
    button.addEventListener('click', () => showRequest(request)); labelCell.append(button);
    const flags = node('td');
    for (const change of request.changes) flags.append(node('span', `badge ${change}`, changeLabels[change]));
    if (!request.changes.length) flags.append(node('span', 'badge', 'Unflagged'));
    const count = node('td', '', `${number(request.before?.count ?? 0)} → ${number(request.after?.count ?? 0)}`);
    const size = node('td', direction(request.delta.bodyBytes), signed(request.delta.bodyBytes, bytes));
    size.title = 'Change in known response body bytes. A dash means incomplete measurements.';
    const timing = node('td', direction(request.delta.durationMs), signed(request.delta.durationMs, duration));
    timing.title = 'Change in group median duration. A dash means missing coverage or a group present in only one capture.';
    const errors = node('td', direction(request.delta.errorCount), `${errorDisplay(request.before)} → ${errorDisplay(request.after)}`);
    errors.title = '? = unknown status. * = some statuses are missing. HTTP errors are statuses 400–599.';
    row.append(labelCell, flags, count, size, timing, errors); fragment.append(row);
  }
  if (!requests.length) {
    const row = node('tr', 'empty-row'); const cell = node('td', '', 'No request groups match this filter. Try another change type or clear your search.'); cell.colSpan = 6; row.append(cell); fragment.append(row);
  }
  $('request-rows').replaceChildren(fragment);
  $('table-count').replaceChildren(node('span', '', `${Math.min(rowLimit, requests.length)} of ${number(requests.length)} matching groups`));
  if (requests.length > rowLimit) {
    const more = node('button', 'text-button', 'Show 200 more'); more.type = 'button'; more.style.marginLeft = '12px';
    more.addEventListener('click', () => { rowLimit += 200; renderTable(); }); $('table-count').append(more);
  }
}
function updateFilters() {
  document.querySelectorAll('[data-filter]').forEach(button => {
    const active = button.dataset.filter === activeFilter;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
}
$('filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]');
  if (!button || !result) return;
  activeFilter = button.dataset.filter; rowLimit = 200; updateFilters(); renderTable();
});
$('path-search').addEventListener('input', () => { rowLimit = 200; renderTable(); });

function showRequest(request) {
  $('request-title').textContent = `${request.id} · ${request.method}`;
  $('request-url').textContent = request.displayUrl;
  const table = node('table', 'detail-table');
  table.append(node('caption', '', 'Measurements for this method + URL group'));
  const head = node('thead'), header = node('tr');
  for (const label of ['Metric', 'Before', 'After']) { const th = node('th', '', label); th.scope = 'col'; header.append(th); }
  head.append(header); table.append(head);
  const body = node('tbody');
  const measures = [
    ['Requests', group => number(group.count)],
    ['Known response body bytes', group => `${bytes(group.totalBodyBytes)} (${group.knownBodyBytes}/${group.count} known)`],
    ['Known decoded content bytes', group => `${bytes(group.totalContentBytes)} (${group.knownContentBytes}/${group.count} known)`],
    ['Median request duration', group => `${duration(group.medianDurationMs)} (${group.knownDuration}/${group.count} known)`],
    ['Observed HTTP errors', group => `${number(group.errorCount)} (${group.knownStatus}/${group.count} statuses known)`],
    ['Observed status codes', group => group.statuses.map(item => `${item.status} × ${item.count}`).join(', ') || 'Unknown'],
  ];
  for (const [label, format] of measures) { const row = node('tr'); row.append(node('td', '', label), node('td', '', request.before ? format(request.before) : 'Not present'), node('td', '', request.after ? format(request.after) : 'Not present')); body.append(row); }
  table.append(body); $('request-detail').replaceChildren(table);
  $('request-dialog').showModal();
}
$('close-request').addEventListener('click', () => $('request-dialog').close());

function updateExportNote() {
  $('export-note').textContent = $('include-urls').checked
    ? 'URL paths and query names may contain sensitive data. Query values are redacted; review the report before sharing.'
    : 'Exports use request IDs by default. Headers, cookies, and bodies are excluded.';
}
$('include-urls').addEventListener('change', updateExportNote);
function exportOptions() { return { includeUrls: $('include-urls').checked }; }
function download(content, extension, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = node('a'); link.href = url; link.download = `harbordiff-report.${extension}`;
  document.body.append(link); link.click(); link.remove();
  // Give browsers time to finish initiating the download before revoking the local object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('markdown-button').addEventListener('click', () => {
  if (!result) return;
  download(toMarkdown(result, exportOptions()), 'md', 'text/markdown;charset=utf-8');
  showFeedback('Markdown report downloaded. Input filenames and HAR payloads are excluded.', false, 'export-feedback');
});
$('json-button').addEventListener('click', () => {
  if (!result) return;
  download(JSON.stringify(toPublicReport(result, exportOptions()), null, 2), 'json', 'application/json');
  showFeedback('JSON report downloaded. Input filenames and HAR payloads are excluded.', false, 'export-feedback');
});
$('copy-button').addEventListener('click', async () => {
  if (!result) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(toMarkdown(result, exportOptions()));
    showFeedback('Summary copied as Markdown. Ready for your issue or debugging notes.', false, 'export-feedback');
  } catch {
    showFeedback('Clipboard access is unavailable. Use the Markdown download button to save the same report.', true, 'export-feedback');
    $('markdown-button').focus();
  }
});

// A shared demo link loads only the built-in synthetic pair. HAR data never enters the URL.
if (location.hash === '#demo') loadDemo();
