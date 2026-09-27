import test from 'node:test';
import assert from 'node:assert/strict';
import { compareHar, parseHar, toMarkdown, toPublicReport } from '../src/har-core.js';

const capture = (...entries) => ({ log: { version: '1.2', entries } });
const request = ({ url = 'https://example.test/resource', status = 200, bodySize = 100, time = 100 } = {}) => ({
  request: { method: 'GET', url },
  response: { status, bodySize, content: { size: 200 } },
  time,
});

test('release privacy: exports exclude canaries from every sensitive HAR surface', () => {
  const entry = request({ url: 'https://USER_CANARY:PASS_CANARY@HOST_CANARY.test/PATH_CANARY?QUERYNAME_CANARY=QUERYVALUE_CANARY#FRAGMENT_CANARY' });
  entry.request.headers = [{ name: 'Authorization', value: 'HEADER_CANARY' }];
  entry.request.cookies = [{ name: 'session', value: 'COOKIE_CANARY' }];
  entry.request.queryString = [{ name: 'QUERYNAME_CANARY', value: 'QUERYVALUE_CANARY' }];
  entry.request.postData = { text: 'REQUESTBODY_CANARY', params: [{ fileName: 'FILENAME_CANARY.har' }] };
  entry.response.content.text = 'RESPONSEBODY_CANARY';
  entry.response.redirectURL = 'https://REDIRECT_CANARY.test';
  entry.serverIPAddress = 'IPADDRESS_CANARY';
  const input = capture(entry);
  input.log.pages = [{ title: 'PAGETITLE_CANARY' }];
  input.log.creator = { name: 'CREATOR_CANARY' };
  const result = compareHar(capture(), input, { ignoreQueryParams: ['QUERYNAME_CANARY'] });
  for (const text of [JSON.stringify(toPublicReport(result)), toMarkdown(result)]) {
    assert.doesNotMatch(text, /canary/i);
    assert.match(text, /R001/);
  }
  const optedIn = JSON.stringify(toPublicReport(result, { includeUrls: true }));
  assert.match(optedIn, /PATH_CANARY/);
  assert.doesNotMatch(optedIn, /USER_CANARY|PASS_CANARY|QUERYVALUE_CANARY|FRAGMENT_CANARY|BODY_CANARY|HEADER_CANARY|COOKIE_CANARY/);
});

test('release privacy: invalid JSON never quotes the original secret in diagnostics', () => {
  assert.throws(() => parseHar('{"PRIVATE_JSON_CANARY": bad}'), error => {
    assert.doesNotMatch(error.message, /PRIVATE_JSON_CANARY|bad/);
    return true;
  });
});

test('release protocol: UTF-8 BOM is accepted', () => {
  assert.equal(parseHar('\uFEFF' + JSON.stringify(capture(request()))).entries.length, 1);
});

test('release protocol: duplicate query parameter order remains part of request identity', () => {
  const result = compareHar(
    capture(request({ url: 'https://example.test/?sort=price&sort=name' })),
    capture(request({ url: 'https://example.test/?sort=name&sort=price' })),
  );
  assert.equal(result.requests.length, 2);
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.removed, 1);
});

test('release correctness: repeated request ordering cannot create a regression', () => {
  const entries = [request({ time: 40, bodySize: 10 }), request({ time: 160, bodySize: 20, status: 503 })];
  const result = compareHar(capture(...entries), capture(...entries.toReversed()));
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].before.count, 2);
  assert.equal(result.requests[0].before.medianDurationMs, 100);
  assert.equal(result.summary.changed, 0);
});

test('release correctness: added and removed groups have meaningful signed deltas', () => {
  const entry = request({ status: 500, bodySize: 120 });
  const added = compareHar(capture(), capture(entry)).requests[0];
  assert.equal(added.delta.count, 1);
  assert.equal(added.delta.bodyBytes, 120);
  assert.equal(added.delta.errorCount, 1);
  assert.equal(added.delta.durationMs, null);
  assert.ok(added.changes.includes('added'));
  assert.ok(added.changes.includes('errors'));
  const removed = compareHar(capture(entry), capture()).requests[0];
  assert.equal(removed.delta.count, -1);
  assert.equal(removed.delta.bodyBytes, -120);
  assert.equal(removed.delta.errorCount, -1);
  assert.equal(removed.delta.durationMs, null);
  assert.deepEqual(removed.changes, ['removed']);
});

test('release correctness: unknown byte coverage cannot become a zero-valued comparison', () => {
  for (const bodySize of [-1, null, undefined]) {
    const unknown = request();
    unknown.response.bodySize = bodySize;
    for (const [before, after] of [[capture(request()), capture(unknown)], [capture(unknown), capture(request())]]) {
      const row = compareHar(before, after).requests[0];
      assert.equal(row.delta.bodyBytes, null);
      assert.ok(!row.changes.includes('bytes'));
    }
  }
  const addedUnknown = compareHar(capture(), capture(request({ bodySize: -1 }))).requests[0];
  assert.equal(addedUnknown.after.totalBodyBytes, null);
  assert.equal(addedUnknown.delta.bodyBytes, null);
  assert.ok(!addedUnknown.changes.includes('bytes'));
});

test('release correctness: partial status coverage cannot prove an HTTP error increase', () => {
  for (const [before, after] of [
    [capture(request({ status: 0 })), capture(request({ status: 500 }))],
    [capture(request()), capture(request({ status: 500 }), request({ status: 0 }))],
  ]) {
    const row = compareHar(before, after).requests[0];
    assert.equal(row.delta.errorCount, null);
    assert.ok(!row.changes.includes('errors'));
  }
});

test('release safety: opt-in URL paths cannot form active Markdown image or link syntax', () => {
  const result = compareHar(capture(), capture(request({ url: 'https://example.test/![image](https://remote.test/pixel)/[link](https://remote.test/)' })));
  const markdown = toMarkdown(result, { includeUrls: true });
  assert.doesNotMatch(markdown, /!\[image\]\(|\[link\]\(/);
});
