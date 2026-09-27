/** Local-only HAR 1.2 comparison. No I/O, network requests, or HAR code execution. */
export const MAX_HAR_BYTES = 25 * 1024 * 1024;
export const MAX_HAR_ENTRIES = 30_000;
export const CHANGE_TYPES = Object.freeze(['added', 'removed', 'errors', 'bytes', 'duration', 'count']);

const parsedCaptures = new WeakSet();
const PUBLIC_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE', 'QUERY']);
const OBSERVATION_NOTE = 'These are observations from two captures. Cache state, network conditions, devices, and user actions can differ; the comparison does not establish a cause.';
const COVERAGE_NOTE = 'Unknown or negative values remain unknown. Totals sum known values only. Byte and duration changes are withheld when either group has incomplete coverage; medians use known durations only.';
const GROUPING_NOTE = 'Requests are grouped by case-sensitive HTTP method and URL, including query values unless explicitly ignored. Credentials and fragments do not determine grouping. Query keys are sorted, preserving the order of repeated values. Repeated requests, including POST requests with different payloads, are aggregated; payloads are not inspected or retained.';
const FLAG_NOTE = 'Flagged groups have one or more selected kinds of increase, newly observed errors, additions, or removals. Improvements and other differences can exist without a flag. The legacy summary.changed field is an alias for summary.flagged.';
const ERROR_NOTE = 'An errors flag means HTTP errors on an added request group, more observed errors, or an error status not observed before. For matched groups, error flags and error-count deltas are withheld if either capture has unknown statuses; observed error counts remain visible.';
const URL_NOTE = 'Included URLs have credentials and fragments removed and every query value redacted. URL paths and query parameter names can still contain sensitive information.';
const PRIVATE_NOTE = 'This report uses request aliases. It excludes URLs, hosts, paths, query parameters, headers, cookies, bodies, and input filenames.';

export class HarValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HarValidationError';
    this.code = 'INVALID_HAR';
  }
}

function fail(message) { throw new HarValidationError(message); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function knownNumber(value, integer = false) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER && (!integer || Number.isSafeInteger(value)) ? value : null;
}
function knownStatus(value) { return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null; }

function safeUrl(value, index) {
  if (typeof value !== 'string' || !value.trim() || value.length > 65_536) fail(`log.entries[${index}].request.url must be an absolute HTTP(S) URL of at most 65536 characters.`);
  let url;
  try { url = new URL(value); } catch { fail(`log.entries[${index}].request.url must be an absolute HTTP(S) URL.`); }
  if (!['http:', 'https:'].includes(url.protocol)) fail(`log.entries[${index}].request.url must use HTTP or HTTPS.`);
  return url;
}

function displayUrl(urlValue) {
  const url = new URL(urlValue);
  url.username = '';
  url.password = '';
  url.hash = '';
  const names = [...url.searchParams.keys()];
  url.search = '';
  for (const name of names) url.searchParams.append(name, '[REDACTED]');
  return url.href;
}

function validateSize(input) {
  let text = input;
  if (typeof input !== 'string') {
    try { text = JSON.stringify(input); } catch { fail('HAR input must be JSON serializable.'); }
  }
  if (typeof text !== 'string') fail('HAR input must be a JSON string or object.');
  // One serialization for object input; it is not parsed or serialized again.
  if (text.length > MAX_HAR_BYTES || new TextEncoder().encode(text).byteLength > MAX_HAR_BYTES) fail('HAR exceeds the 25 MiB input limit.');
}

/** Parse HAR 1.2 into immutable, minimal entries. Only url retains query values for matching. */
export function parseHar(input) {
  if (isObject(input) && parsedCaptures.has(input)) return input;
  if (typeof input !== 'string' && !isObject(input)) fail('HAR input must be a JSON string or object.');
  validateSize(input);
  let raw = input;
  if (typeof input === 'string') {
    try { raw = JSON.parse(input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input); } catch { fail('HAR input is not valid JSON.'); }
  }
  if (!isObject(raw) || !isObject(raw.log)) fail('HAR must contain a log object.');
  if (raw.log.version !== '1.2') fail('HAR log.version must be "1.2".');
  if (!Array.isArray(raw.log.entries)) fail('HAR log.entries must be an array.');
  if (raw.log.entries.length > MAX_HAR_ENTRIES) fail('HAR exceeds the 30000 entry limit.');
  const coverage = { entries: raw.log.entries.length, knownStatus: 0, knownDuration: 0, knownBodyBytes: 0, knownContentBytes: 0 };
  const entries = raw.log.entries.map((entry, index) => {
    if (!isObject(entry) || !isObject(entry.request) || !isObject(entry.response)) fail(`log.entries[${index}] must contain request and response objects.`);
    const method = entry.request.method;
    if (typeof method !== 'string' || !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,32}$/.test(method)) fail(`log.entries[${index}].request.method must be an HTTP method token.`);
    const url = safeUrl(entry.request.url, index);
    const normalized = {
      method,
      url: url.href,
      displayUrl: displayUrl(url.href),
      status: knownStatus(entry.response.status),
      durationMs: knownNumber(entry.time),
      bodyBytes: knownNumber(entry.response.bodySize, true),
      contentBytes: knownNumber(entry.response.content?.size, true),
    };
    if (normalized.status !== null) coverage.knownStatus++;
    if (normalized.durationMs !== null) coverage.knownDuration++;
    if (normalized.bodyBytes !== null) coverage.knownBodyBytes++;
    if (normalized.contentBytes !== null) coverage.knownContentBytes++;
    return Object.freeze(normalized);
  });
  const capture = Object.freeze({ version: '1.2', entries: Object.freeze(entries), coverage: Object.freeze(coverage) });
  parsedCaptures.add(capture);
  return capture;
}

function matchingKey(entry, ignoredParams) {
  const url = new URL(entry.url);
  url.hash = '';
  url.username = '';
  url.password = '';
  const params = [...url.searchParams.entries()].filter(([name]) => !ignoredParams.has(name));
  params.sort(([ak], [bk]) => ak < bk ? -1 : ak > bk ? 1 : 0);
  url.search = '';
  for (const [name, value] of params) url.searchParams.append(name, value);
  return `${entry.method} ${url.href}`;
}

function totalKnown(values) {
  if (!values.length) return null;
  let sum = 0;
  for (const value of values) {
    sum += value;
    if (!Number.isSafeInteger(sum)) return null;
  }
  return sum;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] + (sorted[middle] - sorted[middle - 1]) / 2;
}

function aggregateEntries(entries) {
  const body = [], content = [], durations = [];
  const statuses = new Map();
  let errorCount = 0, statusCount = 0;
  for (const entry of entries) {
    if (entry.bodyBytes !== null) body.push(entry.bodyBytes);
    if (entry.contentBytes !== null) content.push(entry.contentBytes);
    if (entry.durationMs !== null) durations.push(entry.durationMs);
    if (entry.status !== null) {
      statusCount++;
      statuses.set(entry.status, (statuses.get(entry.status) ?? 0) + 1);
      if (entry.status >= 400) errorCount++;
    }
  }
  return {
    count: entries.length,
    totalBodyBytes: entries.length ? totalKnown(body) : 0, knownBodyBytes: body.length,
    totalContentBytes: entries.length ? totalKnown(content) : 0, knownContentBytes: content.length,
    medianDurationMs: median(durations), knownDuration: durations.length,
    errorCount, knownStatus: statusCount,
    statuses: [...statuses].sort(([a], [b]) => a - b).map(([status, count]) => ({ status, count })),
  };
}

function groupCapture(capture, ignoredParams) {
  const groups = new Map();
  for (const entry of capture.entries) {
    const key = matchingKey(entry, ignoredParams);
    if (!groups.has(key)) groups.set(key, { method: entry.method, displayUrl: entry.displayUrl, entries: [] });
    groups.get(key).entries.push(entry);
  }
  for (const group of groups.values()) {
    group.aggregate = aggregateEntries(group.entries);
    delete group.entries;
  }
  return groups;
}

function complete(group, field) { return !group || group[field] === group.count; }
function countDelta(before, after) { return (after?.count ?? 0) - (before?.count ?? 0); }
function bytesDelta(before, after, totalField = 'totalBodyBytes', coverageField = 'knownBodyBytes') {
  if (!complete(before, coverageField) || !complete(after, coverageField)) return null;
  if ((before && before[totalField] === null) || (after && after[totalField] === null)) return null;
  return (after?.[totalField] ?? 0) - (before?.[totalField] ?? 0);
}

function parseOptions(options) {
  if (!isObject(options)) throw new TypeError('Comparison options must be an object.');
  const ignored = options.ignoreQueryParams ?? [];
  const filters = options.filters ?? [];
  if (!Array.isArray(ignored) || ignored.some(value => typeof value !== 'string')) throw new TypeError('ignoreQueryParams must be an array of parameter names.');
  if (!Array.isArray(filters) || filters.some(value => !CHANGE_TYPES.includes(value))) throw new TypeError('filters must contain supported change types.');
  const threshold = (name, fallback) => {
    const value = options[name] ?? fallback;
    if (knownNumber(value) === null) throw new TypeError(`${name} must be a nonnegative finite number.`);
    return value;
  };
  return {
    ignored: new Set(ignored), filters: new Set(filters),
    minByteIncrease: threshold('minByteIncrease', 0),
    minDurationIncreaseMs: threshold('minDurationIncreaseMs', 100),
    minCountIncrease: threshold('minCountIncrease', 1),
  };
}

function captureSummary(capture, groups) {
  const aggregate = aggregateEntries(capture.entries);
  return { requestCount: aggregate.count, groupCount: groups.size, ...aggregate, coverage: { ...capture.coverage } };
}

/** Compare capture observations. Result never contains internal match keys or original URLs. */
export function compareHar(beforeRaw, afterRaw, options = {}) {
  const settings = parseOptions(options);
  const before = parseHar(beforeRaw), after = parseHar(afterRaw);
  const left = groupCapture(before, settings.ignored), right = groupCapture(after, settings.ignored);
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  const requests = keys.map((key, index) => {
    const prior = left.get(key), next = right.get(key);
    const b = prior?.aggregate ?? null, a = next?.aggregate ?? null;
    const delta = {
      count: countDelta(b, a),
      bodyBytes: bytesDelta(b, a),
      contentBytes: bytesDelta(b, a, 'totalContentBytes', 'knownContentBytes'),
      durationMs: b && a && complete(b, 'knownDuration') && complete(a, 'knownDuration') ? a.medianDurationMs - b.medianDurationMs : null,
      errorCount: complete(b, 'knownStatus') && complete(a, 'knownStatus') ? (a?.errorCount ?? 0) - (b?.errorCount ?? 0) : null,
    };
    const changes = [];
    if (!b) changes.push('added');
    if (!a) changes.push('removed');
    const priorErrors = new Set((b?.statuses ?? []).filter(({ status }) => status >= 400).map(({ status }) => status));
    if (a && a.errorCount > 0 && (!b || (complete(b, 'knownStatus') && complete(a, 'knownStatus') && (a.errorCount > b.errorCount || a.statuses.some(({ status }) => status >= 400 && !priorErrors.has(status)))))) changes.push('errors');
    if (delta.bodyBytes !== null && delta.bodyBytes > 0 && delta.bodyBytes >= settings.minByteIncrease) changes.push('bytes');
    if (delta.durationMs !== null && delta.durationMs > 0 && delta.durationMs >= settings.minDurationIncreaseMs) changes.push('duration');
    if (delta.count > 0 && delta.count >= settings.minCountIncrease) changes.push('count');
    const impactScore = (changes.includes('errors') ? 1_000_000 : 0) + (changes.includes('added') || changes.includes('removed') ? 10_000 : 0)
      + (changes.includes('bytes') ? Math.min(5_000, (delta.bodyBytes ?? 0) / 1024) : 0)
      + (changes.includes('duration') ? Math.min(5_000, delta.durationMs ?? 0) : 0)
      + (changes.includes('count') ? Math.min(1_000, delta.count * 10) : 0);
    return { id: `R${String(index + 1).padStart(3, '0')}`, method: (next ?? prior).method, displayUrl: (next ?? prior).displayUrl, before: b, after: a, delta, changes, impactScore };
  });
  const summary = { added: 0, removed: 0, errors: 0, bytes: 0, duration: 0, count: 0, flagged: 0, changed: 0, totalGroups: requests.length, filteredGroups: 0 };
  for (const request of requests) {
    if (request.changes.length) summary.flagged++;
    for (const change of request.changes) summary[change]++;
  }
  // Kept for consumers of the original API; this counts flags, not every difference.
  summary.changed = summary.flagged;
  const filtered = requests.filter(request => !settings.filters.size || request.changes.some(change => settings.filters.has(change)));
  filtered.sort((a, b) => b.impactScore - a.impactScore || a.id.localeCompare(b.id, 'en'));
  summary.filteredGroups = filtered.length;
  return {
    schemaVersion: 1,
    before: captureSummary(before, left), after: captureSummary(after, right), summary,
    requests: filtered,
    coverage: { before: { ...before.coverage }, after: { ...after.coverage } },
    notes: [OBSERVATION_NOTE, COVERAGE_NOTE, GROUPING_NOTE, ERROR_NOTE, FLAG_NOTE],
    matching: { ignoredQueryParameterCount: settings.ignored.size },
  };
}

function copyAggregate(group) {
  if (!group) return null;
  return {
    count: group.count, totalBodyBytes: group.totalBodyBytes, knownBodyBytes: group.knownBodyBytes,
    totalContentBytes: group.totalContentBytes, knownContentBytes: group.knownContentBytes,
    medianDurationMs: group.medianDurationMs, knownDuration: group.knownDuration,
    errorCount: group.errorCount, knownStatus: group.knownStatus,
    statuses: group.statuses.map(({ status, count }) => ({ status, count })),
  };
}

function copyCoverage(coverage) {
  return { entries: coverage.entries, knownStatus: coverage.knownStatus, knownDuration: coverage.knownDuration, knownBodyBytes: coverage.knownBodyBytes, knownContentBytes: coverage.knownContentBytes };
}

/** Create an explicit allowlist export. URLs are opt-in; no raw HAR is ever included. */
export function toPublicReport(result, { includeUrls = false } = {}) {
  const summary = Object.fromEntries([...CHANGE_TYPES, 'flagged', 'changed', 'totalGroups', 'filteredGroups'].map(key => [key, result.summary[key]]));
  const copySummary = group => ({ requestCount: group.requestCount, groupCount: group.groupCount, ...copyAggregate(group), coverage: copyCoverage(group.coverage) });
  return {
    schemaVersion: 1,
    privacy: includeUrls ? 'redacted-urls' : 'aliases-only',
    before: copySummary(result.before), after: copySummary(result.after), summary,
    coverage: { before: copyCoverage(result.coverage.before), after: copyCoverage(result.coverage.after) },
    requests: result.requests.map(request => ({
      id: request.id, method: PUBLIC_METHODS.has(request.method) ? request.method : 'CUSTOM',
      ...(includeUrls ? { displayUrl: displayUrl(request.displayUrl) } : {}),
      before: copyAggregate(request.before), after: copyAggregate(request.after),
      delta: { count: request.delta.count, bodyBytes: request.delta.bodyBytes, contentBytes: request.delta.contentBytes, durationMs: request.delta.durationMs, errorCount: request.delta.errorCount },
      changes: [...request.changes], impactScore: request.impactScore,
    })),
    matching: { ignoredQueryParameterCount: result.matching.ignoredQueryParameterCount },
    notes: [OBSERVATION_NOTE, COVERAGE_NOTE, GROUPING_NOTE, ERROR_NOTE, FLAG_NOTE, includeUrls ? URL_NOTE : PRIVATE_NOTE],
  };
}

function markdownText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g, char => `&#${char.charCodeAt(0)};`).replace(/[\r\n]/g, ' ');
}
function number(value, suffix = '') { return value === null || value === undefined ? 'unknown' : `${Math.round(value * 100) / 100}${suffix}`; }
function changeNumber(value, suffix = '') { return value === null ? 'unknown' : `${value > 0 ? '+' : ''}${number(value, suffix)}`; }
function coverageText(group) { return `${group.knownBodyBytes}/${group.entries} body sizes; ${group.knownDuration}/${group.entries} durations; ${group.knownStatus}/${group.entries} statuses`; }

/** Plain Markdown issue summary. It uses aliases unless redacted URLs are explicitly enabled. */
export function toMarkdown(result, options = {}) {
  const report = toPublicReport(result, options);
  const lines = [
    '# HarborDiff capture comparison', '',
    `${report.before.requestCount} → ${report.after.requestCount} requests; ${report.summary.flagged} flagged groups out of ${report.summary.totalGroups}.`, '',
    `Coverage before: ${coverageText(report.coverage.before)}.`,
    `Coverage after: ${coverageText(report.coverage.after)}.`, '',
    '| Request | Changes | Count | Body bytes | Median duration | HTTP errors |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const request of report.requests) {
    const b = request.before, a = request.after;
    const label = `${request.id} ${request.method}${request.displayUrl ? ` ${request.displayUrl}` : ''}`;
    const durationCoverage = `${b?.knownDuration ?? 0}/${b?.count ?? 0} → ${a?.knownDuration ?? 0}/${a?.count ?? 0} known`;
    const bodyCoverage = `${b?.knownBodyBytes ?? 0}/${b?.count ?? 0} → ${a?.knownBodyBytes ?? 0}/${a?.count ?? 0} known`;
    const statusCoverage = `${b?.knownStatus ?? 0}/${b?.count ?? 0} → ${a?.knownStatus ?? 0}/${a?.count ?? 0} known`;
    lines.push(`| ${markdownText(label)} | ${request.changes.join(', ') || 'no flagged change'} | ${b?.count ?? 0} → ${a?.count ?? 0} | ${number(b?.totalBodyBytes)} → ${number(a?.totalBodyBytes)} (${changeNumber(request.delta.bodyBytes)}; ${bodyCoverage}) | ${number(b?.medianDurationMs, ' ms')} → ${number(a?.medianDurationMs, ' ms')} (${changeNumber(request.delta.durationMs, ' ms')}; ${durationCoverage}) | ${b?.errorCount ?? 0} → ${a?.errorCount ?? 0} (${statusCoverage}) |`);
  }
  if (!report.requests.length) lines.push('| — | No matching request groups | — | — | — | — |');
  lines.push('', 'Notes:', '', ...report.notes.map(note => `- ${note}`), `- Explicitly ignored query parameter names: ${report.matching.ignoredQueryParameterCount}.`, '');
  return lines.join('\n');
}
