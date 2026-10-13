import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('./check-public.mjs', import.meta.url));
function directory(t) {
  const path = mkdtempSync(join(tmpdir(), 'las-olas-public-check-'));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
function run(...args) { return spawnSync(process.execPath, [scanner, ...args], { encoding: 'utf8' }); }

test('public static check accepts a minimal isolated demo and rejects a disguised SQLite file', t => {
  const path = directory(t);
  writeFileSync(join(path, 'index.html'), '<!doctype html><title>Fictional demo</title>');
  writeFileSync(join(path, 'app.js'), 'const storage="las-olas.browser-demo.v1";');
  const clean = run('--static', path);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /Synthetic seed: 4 .test accounts, 3 fictional vessels/);
  writeFileSync(join(path, 'innocent.bin'), Buffer.from('SQLite format 3\u0000fictional fixture'));
  const unsafe = run('--static', path);
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /SQLite content detected/);
});

test('public static check catches source paths, secret-shaped tokens and exposed source maps', t => {
  const path = directory(t);
  writeFileSync(join(path, 'index.html'), '<!doctype html><title>Fictional demo</title>');
  writeFileSync(join(path, 'app.js'), `const storage="las-olas.browser-demo.v1";const fixture=${JSON.stringify('ghp_' + 'A'.repeat(40))};`);
  writeFileSync(join(path, 'debug.js.map'), JSON.stringify({ sourceRoot: ['', 'Users', 'demo-person', 'Private'].join('/') + '/' }));
  const result = run('--static', path);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub access token/);
  assert.match(result.stderr, /source\/native\/debug output/);
  assert.match(result.stderr, /personal absolute source path/);
});

test('repository check inspects indexed content even if the working file is later cleaned', t => {
  const path = directory(t);
  execFileSync('git', ['init', '-q', path]);
  writeFileSync(join(path, 'README.md'), 'Fictional sample source only.');
  execFileSync('git', ['-C', path, 'add', 'README.md']);
  assert.equal(run('--repository', path).status, 0);
  writeFileSync(join(path, '.env.local'), 'DEMO_FIXTURE=true');
  execFileSync('git', ['-C', path, 'add', '-f', '.env.local']);
  writeFileSync(join(path, '.env.local'), '');
  const result = run('--repository', path);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prohibited private\/runtime file .env.local/);
  assert.match(result.stdout, /exact staged\/tracked blobs inspected/);
});

// Expo keeps the asset package origin in its output path; allow only the known font shape and a real sfnt header.
test('public static check permits the bundled Expo icon font and rejects arbitrary dependency output', t => {
  const path=directory(t);
  writeFileSync(join(path,'index.html'),'<title>Demo</title>');
  writeFileSync(join(path,'app.js'),'const storage="las-olas.browser-demo.v1";');
  const fonts=join(path,'assets','node_modules','@expo','vector-icons','build','vendor','react-native-vector-icons','Fonts');
  mkdirSync(fonts,{recursive:true});
  writeFileSync(join(fonts,'Feather.'+'a'.repeat(32)+'.ttf'),Buffer.from([0,1,0,0,0,1]));
  assert.equal(run('--static',path).status,0);
  writeFileSync(join(fonts,'unexpected.js'),'const sample=true;');
  const result=run('--static',path);
  assert.equal(result.status,1);
  assert.match(result.stderr,/prohibited runtime\/dependency directory/);
});
