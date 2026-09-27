import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHar, compareHar, toPublicReport, toMarkdown, HarValidationError, MAX_HAR_BYTES, MAX_HAR_ENTRIES } from '../src/har-core.js';

const entry = ({ url = 'https://example.test/api', method = 'GET', status = 200, time = 100, bodySize = 100, contentSize = 150, ...extra } = {}) => ({
  request: { method, url, headers: [], cookies: [] },
  response: { status, bodySize, content: { size: contentSize } }, time, ...extra,
});
const har = (...entries) => ({ log: { version: '1.2', entries } });

test('rejects malformed JSON, non-HAR, wrong version, invalid entries and non-HTTP URLs', () => {
  for (const input of ['oops', null, [], {}, { log: { version: '1.1', entries: [] } }, { log: { version: '1.2', entries: {} } }, har({}), har(entry({ url: 'javascript:alert(1)' })), har(entry({ method: '<img>' }))]) {
    assert.throws(() => parseHar(input), HarValidationError);
  }
  assert.equal(parseHar(JSON.stringify(har())).entries.length, 0);
  assert.equal(parseHar('\uFEFF' + JSON.stringify(har(entry()))).entries.length, 1);
});

test('enforces byte and entry budgets for strings and objects', () => {
  assert.throws(() => parseHar(' '.repeat(MAX_HAR_BYTES + 1)), /25 MiB/);
  assert.throws(() => parseHar({ log: { version: '1.2', entries: [] }, padding: '界'.repeat(Math.floor(MAX_HAR_BYTES / 3) + 1) }), /25 MiB/);
  assert.throws(() => parseHar({ log: { version: '1.2', entries: Array(MAX_HAR_ENTRIES + 1).fill({}) } }), /30000/);
});

test('retains unknown values and never falls back from body size to decoded content size', () => {
  const parsed = parseHar(har(entry({ status: 0, time: -1, bodySize: -1, contentSize: 200 })));
  assert.equal(parsed.entries[0].status, null);
  assert.equal(parsed.entries[0].durationMs, null);
  assert.equal(parsed.entries[0].bodyBytes, null);
  assert.equal(parsed.entries[0].contentBytes, 200);
  assert.deepEqual(parsed.coverage, { entries: 1, knownStatus: 0, knownDuration: 0, knownBodyBytes: 0, knownContentBytes: 1 });
  assert.equal(parseHar(parsed), parsed);
  assert.ok(Object.isFrozen(parsed.entries[0]));
});

test('treats strings, negatives, nonfinite numbers and impossible status/byte values as unknown', () => {
  for (const bad of [-1, -30, NaN, Infinity, '20', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    const data = entry();
    data.time = bad;
    data.response.bodySize = bad;
    assert.equal(parseHar(har(data)).entries[0].durationMs, null);
    assert.equal(parseHar(har(data)).entries[0].bodyBytes, null);
  }
  const data = parseHar(har(entry({ time: 0, bodySize: 0, contentSize: 0, status: 304 })));
  assert.equal(data.entries[0].bodyBytes, 0);
  assert.equal(data.entries[0].durationMs, 0);
  assert.equal(parseHar(har(entry({ bodySize: 1.2, status: 999 }))).entries[0].bodyBytes, null);
});

test('matches method plus query values; sorts keys while preserving repeated-value order', () => {
  const before = har(entry({ url: 'https://a.test/x?b=3&a=2&a=1' }));
  const same = har(entry({ url: 'https://a.test/x?a=2&b=3&a=1#fragment' }));
  assert.equal(compareHar(before, same).requests.length, 1);
  assert.equal(compareHar(before, same).summary.changed, 0);
  assert.equal(compareHar(before, har(entry({ url: 'https://a.test/x?a=1&a=2&b=3' }))).requests.length, 2);
  assert.equal(compareHar(before, har(entry({ url: 'https://a.test/x?a=1&b=3' }))).requests.length, 2);
  assert.equal(compareHar(before, har(entry({ url: 'https://a.test/x?a=1&a=2&b=4' }))).requests.length, 2);
  assert.equal(compareHar(before, har(entry({ method: 'POST', url: 'https://a.test/x?a=1&a=2&b=3' }))).requests.length, 2);
});

test('unknown status coverage cannot imply new errors for a matched request group', () => {
  for (const [before, after] of [
    [har(entry({ status: 0 })), har(entry({ status: 500 }))],
    [har(entry({ status: 200 })), har(entry({ status: 500 }), entry({ status: 0 }))],
  ]) {
    const row = compareHar(before, after).requests[0];
    assert.equal(row.delta.errorCount, null);
    assert.ok(!row.changes.includes('errors'));
    assert.equal(row.after.errorCount, 1);
  }
  assert.ok(compareHar(har(), har(entry({ status: 500 }), entry({ status: 0 }))).requests[0].changes.includes('errors'));
  assert.ok(compareHar(har(entry({ status: 200 })), har(entry({ status: 500 }))).requests[0].changes.includes('errors'));
});

test('URL credentials do not determine grouping and never enter result or reports', () => {
  const before = har(entry({ url: 'https://alice:BEFORE_SECRET@example.test/api?q=1' }));
  const after = har(entry({ url: 'https://bob:AFTER_SECRET@example.test/api?q=1' }));
  const result = compareHar(before, after);
  assert.equal(result.requests.length, 1);
  assert.equal(result.summary.added, 0);
  assert.equal(result.summary.removed, 0);
  for (const output of [JSON.stringify(result), toMarkdown(result, { includeUrls: true }), JSON.stringify(toPublicReport(result))]) {
    for (const secret of ['alice', 'bob', 'BEFORE_SECRET', 'AFTER_SECRET']) assert.ok(!output.includes(secret));
  }
});

test('method tokens are case-sensitive while anonymous reports hide custom method names', () => {
  const before = har(entry({ method: 'PRIVATE_METHOD_SECRET' }));
  const after = har(entry({ method: 'private_method_secret' }));
  const result = compareHar(before, after);
  assert.equal(result.requests.length, 2);
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.removed, 1);
  assert.equal(parseHar(before).entries[0].method, 'PRIVATE_METHOD_SECRET');
  const report = toPublicReport(result);
  assert.ok(report.requests.every(request => request.method === 'CUSTOM'));
  for (const output of [JSON.stringify(report), toMarkdown(result)]) {
    assert.ok(!output.includes('PRIVATE_METHOD_SECRET'));
    assert.ok(!output.includes('private_method_secret'));
  }
  assert.equal(toPublicReport(compareHar(har(), har(entry({ method: 'QUERY' })))).requests[0].method, 'QUERY');
});

test('flagged summary remains compatible and distinguishes improvements from flagged increases', () => {
  const improved = compareHar(har(entry({ time: 900, bodySize: 1000 })), har(entry({ time: 10, bodySize: 10 })));
  assert.equal(improved.summary.flagged, 0);
  assert.equal(improved.summary.changed, improved.summary.flagged);
  assert.equal(toPublicReport(improved).summary.flagged, 0);
  assert.match(toMarkdown(improved), /0 flagged groups/);
  assert.equal(improved.requests[0].delta.bodyBytes, -990);
  const flagged = compareHar(har(), har(entry()));
  assert.equal(flagged.summary.flagged, 1);
  assert.equal(flagged.summary.changed, flagged.summary.flagged);
});

test('ignores only explicitly selected query parameters and aggregates repeated requests', () => {
  const before = har(entry({ url: 'https://a.test/x?nonce=1&user=1' }));
  const after = har(entry({ url: 'https://a.test/x?nonce=2&user=1', time: 200 }), entry({ url: 'https://a.test/x?nonce=3&user=1', time: 600, status: 503 }));
  const result = compareHar(before, after, { ignoreQueryParams: ['nonce'] });
  assert.equal(result.requests.length, 1);
  const item = result.requests[0];
  assert.equal(item.after.count, 2);
  assert.equal(item.after.medianDurationMs, 400);
  assert.equal(item.after.totalBodyBytes, 200);
  assert.equal(item.after.errorCount, 1);
  assert.deepEqual(item.changes, ['errors', 'bytes', 'duration', 'count']);
  assert.equal(compareHar(before, har(entry({ url: 'https://a.test/x?nonce=2&user=2' })), { ignoreQueryParams: ['nonce'] }).requests.length, 2);
});

test('incomplete coverage cannot imply body, content, duration or error growth', () => {
  const result = compareHar(har(entry({ time: -1, bodySize: -1, contentSize: -1, status: 0 }), entry({ time: 10, bodySize: 10 })), har(entry({ time: 800, bodySize: 1000 }), entry({ time: 1000, bodySize: 2000 })));
  const row = result.requests[0];
  assert.equal(row.before.totalBodyBytes, 10);
  assert.equal(row.before.knownBodyBytes, 1);
  assert.equal(row.before.medianDurationMs, 10);
  assert.equal(row.delta.bodyBytes, null);
  assert.equal(row.delta.contentBytes, null);
  assert.equal(row.delta.durationMs, null);
  assert.equal(row.delta.errorCount, null);
  assert.ok(!row.changes.includes('bytes'));
  assert.ok(!row.changes.includes('duration'));
  assert.match(toMarkdown(result), /1\/2 → 2\/2 known/);
});

test('all unknown totals remain null; unsafe numeric totals do not produce false growth', () => {
  const allUnknown = compareHar(har(), har(entry({ bodySize: -1, contentSize: -1, time: -1 })));
  assert.equal(allUnknown.after.totalBodyBytes, null);
  assert.equal(allUnknown.requests[0].delta.bodyBytes, null);
  assert.equal(allUnknown.before.totalBodyBytes, 0);
  const overflow = compareHar(har(entry({ bodySize: 1 })), har(entry({ bodySize: Number.MAX_SAFE_INTEGER }), entry({ bodySize: Number.MAX_SAFE_INTEGER })));
  assert.equal(overflow.after.totalBodyBytes, null);
  assert.equal(overflow.requests[0].delta.bodyBytes, null);
});

test('filters cover added, removed, errors, bytes, duration and count; aliases are stable', () => {
  const before = har(entry({ url: 'https://a.test/gone' }), entry({ url: 'https://a.test/slow' }));
  const after = har(entry({ url: 'https://a.test/new', status: 500 }), entry({ url: 'https://a.test/slow', time: 500, bodySize: 200 }), entry({ url: 'https://a.test/slow', time: 500, bodySize: 200 }));
  const result = compareHar(before, after);
  for (const filter of ['added', 'removed', 'errors', 'bytes', 'duration', 'count']) {
    const filtered = compareHar(before, after, { filters: [filter] });
    assert.ok(filtered.requests.length > 0);
    for (const row of filtered.requests) {
      assert.ok(row.changes.includes(filter));
      assert.equal(row.id, result.requests.find(candidate => candidate.displayUrl === row.displayUrl).id);
    }
  }
  assert.equal(compareHar(har(entry()), har(entry({ time: 199 }))).summary.duration, 0);
  assert.equal(compareHar(har(entry()), har(entry({ time: 200 }))).summary.duration, 1);
  assert.equal(compareHar(before, after, { minByteIncrease: 10_000 }).summary.bytes, 0);
});

test('public exports omit URLs and raw secrets; URL opt-in still strips query values and credentials', () => {
  const secret = entry({ url: 'https://USER_SECRET:PASS_SECRET@HOST_SECRET.test/PATH_SECRET?key=VALUE_SECRET#FRAGMENT_SECRET' });
  secret.request.headers = [{ name: 'Authorization', value: 'HEADER_SECRET' }];
  secret.request.cookies = [{ name: 'cookie', value: 'COOKIE_SECRET' }];
  secret.request.postData = { text: 'BODY_SECRET' };
  secret.response.content.text = 'RESPONSE_SECRET';
  const raw = har(secret);
  raw.log.creator = { name: 'FILENAME_SECRET' };
  const result = compareHar(har(), raw);
  const internal = JSON.stringify(result);
  for (const secretValue of ['USER_SECRET', 'PASS_SECRET', 'VALUE_SECRET', 'FRAGMENT_SECRET', 'HEADER_SECRET', 'COOKIE_SECRET', 'BODY_SECRET', 'RESPONSE_SECRET', 'FILENAME_SECRET']) assert.ok(!internal.includes(secretValue), secretValue);
  for (const output of [JSON.stringify(toPublicReport(result)), toMarkdown(result)]) {
    for (const secretValue of ['host_secret', 'PATH_SECRET', 'VALUE_SECRET', 'HEADER_SECRET', 'BODY_SECRET', 'key=']) assert.ok(!output.includes(secretValue), secretValue);
    assert.match(output, /R001/);
  }
  const withUrls = JSON.stringify(toPublicReport(result, { includeUrls: true }));
  assert.match(withUrls, /PATH_SECRET/);
  assert.ok(!withUrls.includes('VALUE_SECRET'));
  assert.match(withUrls, /REDACTED/);
  assert.match(withUrls, /paths.*sensitive/);
});

test('malicious URL strings are data only and Markdown cannot inject HTML or extra table cells', () => {
  globalThis.__harInjection = false;
  const result = compareHar(har(), har(entry({ url: 'https://example.test/<img onerror="globalThis.__harInjection=true">/a|b`?x=<script>alert(1)</script>' })));
  const markdown = toMarkdown(result, { includeUrls: true });
  assert.equal(globalThis.__harInjection, false);
  assert.ok(!markdown.includes('<img'));
  assert.ok(!markdown.includes('<script>'));
  assert.match(markdown, /&#124;/);
  assert.ok(!markdown.includes('alert(1)'));
  const imagePath = compareHar(har(), har(entry({ url: 'https://example.test/![image](https://attacker.test/pixel)' })));
  const imageMarkdown = toMarkdown(imagePath, { includeUrls: true });
  assert.ok(!imageMarkdown.includes('![image]('));
  assert.match(imageMarkdown, /&#33;&#91;image&#93;&#40;/);
  delete globalThis.__harInjection;
});

test('POST payload differences do not leak or create false separate groups', () => {
  const a = entry({ method: 'POST' }), b = entry({ method: 'POST' });
  a.request.postData = { text: 'a secret' };
  b.request.postData = { text: 'different secret' };
  const result = compareHar(har(a), har(b));
  assert.equal(result.requests.length, 1);
  assert.match(result.notes.join(' '), /POST.*payloads/);
  assert.ok(!JSON.stringify(result).includes('different secret'));
});

test('rejects misspelled filters and unsafe thresholds instead of silently ignoring configuration', () => {
  for (const options of [{ filters: ['typo'] }, { ignoreQueryParams: '*' }, { minDurationIncreaseMs: -1 }, { minByteIncrease: Infinity }]) assert.throws(() => compareHar(har(), har(), options), TypeError);
});
