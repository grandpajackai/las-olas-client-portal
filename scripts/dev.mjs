import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const processes = [];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error.message);
    }
  }
  const timeout = setTimeout(() => {
    for (const child of processes) {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null || process.platform === 'win32') continue;
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    process.exit(exitCode);
  }, 2500);
  timeout.unref();
  Promise.all(processes.map(child => !child.pid || child.exitCode !== null || child.signalCode !== null
    ? Promise.resolve()
    : new Promise(resolve => child.once('exit', resolve))))
    .then(() => process.exit(exitCode));
}

function start(command, args, name) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    env: process.env,
    shell: false
  });
  processes.push(child);
  child.once('error', error => {
    console.error(`${name} could not start: ${error.message}`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`${name} stopped (${signal ?? code ?? 'unknown'}). Shutting down both processes.`);
      stop(code === 0 ? 0 : 1);
    }
  });
  return child;
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

console.log('Starting Las Olas demo API and browser app. Press Ctrl+C to stop both.');
start(process.execPath, ['server/index.mjs'], 'API');
start(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['expo', 'start', '--web', '--port', '8081'], 'Expo');
