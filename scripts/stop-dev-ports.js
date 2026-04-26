const { execFileSync } = require('node:child_process');

const ports = ['5000', '5173', '5174'];
const isWindows = process.platform === 'win32';

const getWindowsPids = () => {
  const output = execFileSync('netstat.exe', ['-ano'], { encoding: 'utf8' });
  const pids = new Set();

  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);

    if (columns.length < 5 || columns[0] !== 'TCP') {
      continue;
    }

    const localAddress = columns[1];
    const state = columns[3];
    const pid = columns[4];
    const port = localAddress.split(':').pop();

    if (ports.includes(port) && state === 'LISTENING' && pid !== '0') {
      pids.add(pid);
    }
  }

  return [...pids];
};

const stopWindowsPids = (pids) => {
  for (const pid of pids) {
    execFileSync('taskkill.exe', ['/PID', pid, '/T', '/F'], { stdio: 'inherit' });
  }
};

if (!isWindows) {
  console.log('dev:stop is currently configured for Windows local development.');
  process.exit(0);
}

const pids = getWindowsPids();

if (pids.length === 0) {
  console.log(`No dev servers found on ports ${ports.join(', ')}.`);
  process.exit(0);
}

stopWindowsPids(pids);
console.log(`Stopped dev servers on ports ${ports.join(', ')}.`);
