#!/usr/bin/env node
// Read-only guard for the exact files destined for public hosting/source control.
// This checks recognizable leaks and packaging mistakes; it is not a security audit.
import { readFileSync, readdirSync, lstatSync, existsSync, realpathSync } from 'node:fs';
import { resolve, join, relative, extname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { demoUsers, seedRecords, sampleDocument } from '../server/seed.mjs';

const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
  const key = args[index];
  if (!['--static', '--repository'].includes(key) || !args[index + 1]) {
    console.error('Usage: node scripts/check-public.mjs --static <export-directory> [--repository <public-git-root>]');
    process.exit(2);
  }
  options[key] = resolve(args[index + 1]);
}
if (!Object.keys(options).length) {
  console.error('Choose --static for hosted assets, --repository for exact indexed Git blobs, or both.');
  process.exit(2);
}

const problems = [];
const summaries = [];
const forbiddenFilename = /(?:^|\/)(?:\.DS_Store|\.env(?:\..*)?|[^/]+\.(?:sqlite(?:3)?|db)(?:-wal|-shm)?|[^/]+\.(?:pem|p12|pfx|key|mobileprovision|keystore|jks)|credentials(?:\.json)?|id_rsa|id_ed25519)$/i;
const forbiddenFolder = /(?:^|\/)(?:node_modules|\.expo|\.aws|\.ssh|\.codex|\.agents|data|server\/data)(?:\/|$)/;
const textExtensions = new Set(['.html', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.map', '.md', '.txt', '.css', '.yml', '.yaml', '.toml', '.xml', '.sh', '.gitignore']);
const leakPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
  ['OpenAI-style secret', /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/],
  ['GitHub access token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ['personal absolute source path', /(?:\/Users\/[^/\s"'<>]+\/|\/home\/[^/\s"'<>]+\/|[A-Z]:\\Users\\[^\\\s"'<>]+\\)/],
];

function inspect(name, content, kind) {
  const normalized = name.replaceAll('\\', '/');
  if (forbiddenFilename.test(normalized) && basename(normalized) !== '.env.example') problems.push(`${kind}: prohibited private/runtime file ${normalized}`);
  // Expo preserves package-origin paths for this bundled icon font. This is a static font, not an exposed dependency directory.
  const expoIconFont = kind === 'static' && /^assets\/node_modules\/@expo\/vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\/Feather\.[a-f0-9]{32}\.ttf$/.test(normalized) && content.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0]));
  if (forbiddenFolder.test(normalized) && !expoIconFont) problems.push(`${kind}: prohibited runtime/dependency directory ${normalized}`);
  if (kind === 'static' && (/(?:^|\/)(?:server|src|scripts|docs|qa|\.git)(?:\/|$)/.test(normalized) || /\.(?:ts|tsx|mjs|cjs|map|bundle|hbc)$/i.test(normalized))) problems.push(`static: source/native/debug output must not be hosted: ${normalized}`);
  if (content.subarray(0, 16).toString('latin1') === 'SQLite format 3\u0000') problems.push(`${kind}: SQLite content detected in ${normalized}`);
  if (!textExtensions.has(extname(normalized).toLowerCase()) && !normalized.endsWith('.gitignore') && basename(normalized) !== '.env.example') return;
  const value = content.toString('utf8');
  for (const [label, pattern] of leakPatterns) if (pattern.test(value)) problems.push(`${kind}: ${label} detected in ${normalized}`);
}

function inspectSeeds() {
  for (const user of demoUsers) if (!user.email.endsWith('.test')) problems.push(`seed: account ${user.id} does not use a reserved .test email`);
  const vessels = new Set(seedRecords.vessels.map(vessel => vessel.id));
  const requests = new Map(seedRecords.requests.map(request => [request.id, request]));
  for (const [kind, records] of Object.entries(seedRecords)) for (const record of records) {
    if (kind !== 'vessels' && !vessels.has(record.vesselId)) problems.push(`seed: ${kind}/${record.id} references an unknown vessel`);
    if (record.requestId && requests.get(record.requestId)?.vesselId !== record.vesselId) problems.push(`seed: ${kind}/${record.id} has an invalid or cross-vessel request link`);
  }
  for (const document of seedRecords.documents) if (!sampleDocument(document).includes('DEMONSTRATION DOCUMENT')) problems.push(`seed: document ${document.id} lacks an explicit sample label`);
  const serialized = JSON.stringify({ demoUsers, seedRecords });
  if (/\b(?:HIN|passport|socialSecurity|policyNumber|accountNumber)\s*"\s*:/i.test(serialized)) problems.push('seed: review identification-number fields before publication');
  summaries.push(`Synthetic seed: ${demoUsers.length} .test accounts, ${vessels.size} fictional vessels, ${seedRecords.documents.length} labeled sample documents; request links valid.`);
}

function scanStatic(directory) {
  if (!existsSync(join(directory, 'index.html'))) { problems.push('static: index.html is missing from the supplied export directory'); return; }
  let files = 0;
  let javascript = 0;
  let browserDemoMarker = false;
  function walk(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      const name = relative(directory, path);
      if (lstatSync(path).isSymbolicLink()) { problems.push(`static: symlink must not be hosted: ${name}`); continue; }
      if (entry.isDirectory()) { walk(path); continue; }
      const content = readFileSync(path);
      files += 1;
      inspect(name, content, 'static');
      if (extname(name) === '.js') { javascript += 1; browserDemoMarker ||= content.includes(Buffer.from('las-olas.browser-demo.v1')); }
    }
  }
  walk(directory);
  if (!javascript) problems.push('static: no JavaScript bundle found');
  if (!browserDemoMarker) problems.push('static: isolated browser-demo storage marker is absent; verify EXPO_PUBLIC_DEMO_MODE=true export');
  summaries.push(`Static export: ${files} files inspected, ${javascript} JavaScript bundle(s), isolated-demo marker ${browserDemoMarker ? 'present' : 'absent'}.`);
}

function scanRepository(directory) {
  try {
    const top = execFileSync('git', ['-C', directory, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    if (realpathSync(top) !== realpathSync(directory)) { problems.push('repository: point --repository at the dedicated public Git root, not a subfolder in the shared workspace'); return; }
    const staged = execFileSync('git', ['-C', directory, 'ls-files', '--stage', '-z'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
    if (!staged.length) { problems.push('repository: no indexed files; stage the intended public files before scanning'); return; }
    for (const line of staged) {
      const parsed = /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(line);
      if (!parsed) { problems.push('repository: could not parse an indexed entry'); continue; }
      const [, mode, object, stage, name] = parsed;
      if (stage !== '0') { problems.push(`repository: unresolved conflict in ${name}`); continue; }
      if (mode === '120000' || mode === '160000') { problems.push(`repository: symlink/submodule requires explicit publication review: ${name}`); continue; }
      const content = execFileSync('git', ['-C', directory, 'cat-file', 'blob', object], { maxBuffer: 64 * 1024 * 1024 });
      inspect(name, content, 'repository');
    }
    summaries.push(`Public repository index: ${staged.length} exact staged/tracked blobs inspected.`);
  } catch (error) { problems.push(`repository: could not inspect the Git index (${error.code ?? error.message})`); }
}

inspectSeeds();
if (options['--static']) scanStatic(options['--static']);
if (options['--repository']) scanRepository(options['--repository']);
for (const summary of summaries) console.log(summary);
if (problems.length) {
  console.error(`Public handoff check FAILED (${problems.length} finding${problems.length === 1 ? '' : 's'}):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exitCode = 1;
} else {
  console.log('Public handoff check PASSED: no recognized secrets, private source paths, SQLite/runtime files, or packaging mistakes in the inspected content.');
  console.log('Still verify the actual deployed URL, browser-local isolation/reset, and final allowlisted publication tree.');
}
