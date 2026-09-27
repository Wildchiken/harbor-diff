import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const cli = fileURLToPath(new URL('../bin/harbor-diff.js', import.meta.url));
function run(args) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000 }); }
function capture(status) {
  return { log: { version: '1.2', creator: { name: 'synthetic', version: '1' }, entries: [{
    startedDateTime: '2026-09-26T08:00:00.000Z', time: 120,
    request: { method: 'GET', url: 'https://private-canary.example/private-path-canary?token=query-value-canary', headers: [{ name: 'Authorization', value: 'header-canary' }], cookies: [{ name: 'cookie', value: 'cookie-canary' }], postData: { text: 'body-canary' } },
    response: { status, bodySize: 100, content: { size: 100, mimeType: 'application/json', text: 'response-canary' } },
    cache: {}, timings: { send: 0, wait: 100, receive: 20 }
  }] } };
}

async function withCaptures(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'harbor-cli-'));
  try {
    const before = join(dir, 'secret-filename-canary-before.har');
    const after = join(dir, 'secret-filename-canary-after.har');
    await writeFile(before, JSON.stringify(capture(200)));
    await writeFile(after, JSON.stringify(capture(500)));
    await fn({ before, after, dir });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('help and demo work without a network or installation', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--fail-on/);
  const demo = run(['--demo', '--format', 'json']);
  assert.equal(demo.status, 0, demo.stderr);
  assert.equal(JSON.parse(demo.stdout).schemaVersion, 1);
});

test('default JSON and Markdown omit raw URLs, credentials, contents, and filenames', async () => {
  await withCaptures(async ({ before, after }) => {
    for (const format of ['json', 'markdown']) {
      const result = run([before, after, '--format', format]);
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout, /canary/);
      assert.doesNotMatch(result.stderr, /canary/);
    }
    const urls = run([before, after, '--include-urls', '--format', 'json']);
    assert.equal(urls.status, 0, urls.stderr);
    assert.match(urls.stdout, /private-path-canary/);
    assert.doesNotMatch(urls.stdout, /query-value-canary|header-canary|cookie-canary|body-canary|response-canary/);
  });
});

test('explicit fail-on returns 2 while still writing a valid report', async () => {
  await withCaptures(async ({ before, after }) => {
    const result = run([before, after, '--format', 'json', '--fail-on', 'errors']);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).schemaVersion, 1);
    const clean = run([before, before, '--fail-on', 'errors']);
    assert.equal(clean.status, 0, clean.stderr);
  });
});

test('invalid HAR does not echo its source into errors', async () => {
  await withCaptures(async ({ before, after }) => {
    await writeFile(before, '{"token":"invalid-json-canary" malformed');
    const result = run([before, after]);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /canary/);
    assert.equal(result.stdout, '');
  });
});

test('options and file access fail clearly without pretending to compare', () => {
  for (const options of [[], ['--demo', '--format', 'xml'], ['--demo', '--min-bytes', '-1'], ['--demo', '--min-duration-ms', 'Infinity'], ['--demo', '--fail-on', 'anything'], ['--demo', 'extra.har']]) {
    const result = run(options);
    assert.equal(result.status, 1, JSON.stringify(options));
    assert.equal(result.stdout, '');
  }
  const missing = run(['/nonexistent/private-filename-canary.har', '/nonexistent/after.har']);
  assert.equal(missing.status, 1);
  assert.doesNotMatch(missing.stderr, /private-filename-canary/);
});
