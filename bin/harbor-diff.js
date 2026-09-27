#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { compareHar, toMarkdown, toPublicReport } from '../src/har-core.js';
import { createDemoCaptures } from '../src/demo.js';

const HELP = `HarborDiff — explain what changed between two HAR captures.

Usage:
  harbor-diff before.har after.har [options]
  harbor-diff --demo [options]

Options:
  --format markdown|json       Output format (default: markdown)
  --ignore-query key1,key2     Explicit query parameters to ignore when matching
  --min-duration-ms NUMBER     Minimum median duration increase (default: 100)
  --min-bytes NUMBER           Minimum response-body size increase (default: 0)
  --include-urls              Include URL paths; query values remain redacted
  --fail-on TYPE,TYPE          Exit 2 on added,removed,errors,bytes,duration,count
  --help, -h                 Show this help
  --version, -v              Show version

Runs locally. No network calls, dependencies, API keys, or accounts.
Default exports use resource IDs and omit URLs and input file names.
URL paths may contain private data: review an --include-urls report before sharing.
Changes are observations from two captures, not proof of causation.
`;

const knownTypes = new Set(['added', 'removed', 'errors', 'bytes', 'duration', 'count']);
const args = process.argv.slice(2);
let format = 'markdown', demo = false, includeUrls = false;
let minDurationIncreaseMs = 100, minByteIncrease = 0;
let ignoreQueryParams = [], failOn = [], files = [];

function valueAfter(index, option) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} needs a value.`);
  return value;
}

async function main() {
  if (args.includes('--help') || args.includes('-h')) return process.stdout.write(HELP);
  if (args.includes('--version') || args.includes('-v')) return process.stdout.write('0.1.0\n');
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--demo') demo = true;
    else if (arg === '--include-urls') includeUrls = true;
    else if (arg === '--format') format = valueAfter(i++, arg);
    else if (arg === '--ignore-query') ignoreQueryParams = valueAfter(i++, arg).split(',').map(x => x.trim()).filter(Boolean);
    else if (arg === '--fail-on') failOn = valueAfter(i++, arg).split(',').map(x => x.trim()).filter(Boolean);
    else if (arg === '--min-duration-ms' || arg === '--min-bytes') {
      const raw = valueAfter(i++, arg);
      const n = Number(raw);
      if (!raw.trim() || !Number.isFinite(n) || n < 0) throw new Error(`${arg} must be a nonnegative finite number.`);
      if (arg === '--min-duration-ms') minDurationIncreaseMs = n;
      else minByteIncrease = n;
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}. Use --help.`);
    else files.push(arg);
  }
  if (!['markdown', 'json'].includes(format)) throw new Error('--format must be markdown or json.');
  if (failOn.some(type => !knownTypes.has(type))) throw new Error('--fail-on accepts added,removed,errors,bytes,duration,count.');
  if (demo ? files.length !== 0 : files.length !== 2) throw new Error('Provide before.har and after.har, or use --demo. See --help.');

  const readCapture = async (path, label) => {
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('not a regular file');
      if (info.size > 25 * 1024 * 1024) throw new Error('larger than the 25 MiB limit');
      const data = await readFile(path, 'utf8');
      if (Buffer.byteLength(data, 'utf8') > 25 * 1024 * 1024) throw new Error('larger than the 25 MiB limit');
      return data;
    } catch (error) {
      // Do not echo local paths or HAR contents into logs.
      if (error.code) throw new Error(`Cannot read ${label} capture (${error.code}).`);
      throw new Error(`Cannot read ${label} capture: ${error.message}.`);
    }
  };
  const captures = demo ? createDemoCaptures() : {
    before: await readCapture(files[0], 'before'),
    after: await readCapture(files[1], 'after')
  };
  const result = compareHar(captures.before, captures.after, { ignoreQueryParams, minDurationIncreaseMs, minByteIncrease });
  const output = format === 'json'
    ? JSON.stringify(toPublicReport(result, { includeUrls }), null, 2) + '\n'
    : toMarkdown(result, { includeUrls }) + '\n';
  process.stdout.write(output);
  if (failOn.some(type => result.requests.some(request => request.changes.includes(type)))) process.exitCode = 2;
}

main().catch(error => {
  process.stderr.write(`HarborDiff: ${error.message}\n`);
  process.exitCode = 1;
});
