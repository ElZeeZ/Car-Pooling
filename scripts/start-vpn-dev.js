const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = new Set(process.argv.slice(2));
const serveOnly = args.has('--serve-only');
const statusOnly = args.has('--status');
const stopOnly = args.has('--stop');
const clientPort = process.env.VITE_DEV_PORT || process.env.CLIENT_PORT || '5173';

const tailscaleCandidates = [
  process.env.TAILSCALE_EXE,
  'tailscale',
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  'C:\\Program Files (x86)\\Tailscale\\tailscale.exe'
].filter(Boolean);

const findExecutable = () => {
  for (const candidate of tailscaleCandidates) {
    if (candidate === 'tailscale') {
      const lookup = spawnSync('where.exe', ['tailscale'], { encoding: 'utf8' });
      const foundPath = lookup.stdout?.split(/\r?\n/).find(Boolean);
      if (foundPath) {
        return foundPath.trim();
      }
      continue;
    }

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const runTailscale = (tailscaleExe, commandArgs, label) => {
  console.log(`${label}...`);
  const result = spawnSync(tailscaleExe, commandArgs, {
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    const adminHint = output.includes('Access is denied')
      ? '\n\nRun VS Code or PowerShell as Administrator, then run this command again.'
      : '';

    throw new Error(`${label} failed:\n${output}${adminHint}`);
  }

  return (result.stdout ?? '').trim();
};

const runTailscaleInteractive = (tailscaleExe, commandArgs, label) => {
  console.log(`${label}...`);
  const result = spawnSync(tailscaleExe, commandArgs, {
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: false
  });

  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}.`);
  }
};

const normalizeDnsName = (dnsName) => dnsName.replace(/\.$/, '');

const getTailscaleInfo = (tailscaleExe) => {
  const statusOutput = runTailscale(tailscaleExe, ['status', '--json'], 'Tailscale status');
  const status = JSON.parse(statusOutput);
  const dnsName = status.Self?.DNSName ? normalizeDnsName(status.Self.DNSName) : '';
  const tailscaleIp =
    status.Self?.TailscaleIPs?.find((ip) => ip.includes('.')) ??
    runTailscale(tailscaleExe, ['ip', '-4'], 'Tailscale IP').split(/\r?\n/)[0];

  return { dnsName, tailscaleIp };
};

const localAddresses = () =>
  Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (item) =>
        item &&
        item.family === 'IPv4' &&
        !item.internal &&
        /^(10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.|100\.)/.test(item.address)
    )
    .map((item) => item.address);

const configureServe = (tailscaleExe) => {
  runTailscaleInteractive(
    tailscaleExe,
    ['serve', '--bg', '--yes', '--https=443', `http://127.0.0.1:${clientPort}`],
    'Tailscale frontend HTTPS serve'
  );
};

const startProcess = (name, commandLine, env = {}) => {
  const shell = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
  const child = spawn(shell, ['/d', '/s', '/c', commandLine], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ...env },
    stdio: 'inherit'
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}.`);
    }
  });

  return child;
};

const printUrls = ({ dnsName, tailscaleIp }) => {
  console.log('');
  console.log('Routely VPN dev is ready.');

  if (dnsName) {
    console.log('');
    console.log('Use this HTTPS URL on every Tailscale device:');
    console.log(`- https://${dnsName}`);
    console.log('');
    console.log('Backend health check through the same HTTPS site:');
    console.log(`- https://${dnsName}/api/health`);
  } else {
    console.log('');
    console.log('Tailscale DNS name was not detected. Check MagicDNS in Tailscale.');
  }

  if (tailscaleIp) {
    console.log('');
    console.log('Tailscale IP detected:');
    console.log(`- ${tailscaleIp}`);
  }

  const addresses = [...new Set(localAddresses())];
  if (addresses.length) {
    console.log('');
    console.log('Local network URLs, useful for quick checks but not phone location:');
    addresses.forEach((address) => console.log(`- http://${address}:${clientPort}`));
  }

  console.log('');
};

const main = () => {
  const tailscaleExe = findExecutable();

  if (!tailscaleExe) {
    console.error('Tailscale was not found. Install Tailscale, then run this command again.');
    process.exit(1);
  }

  let info;
  try {
    if (stopOnly) {
      console.log(runTailscale(tailscaleExe, ['serve', 'reset'], 'Tailscale serve reset'));
      console.log('Tailscale Serve routes were reset.');
      return;
    }

    info = getTailscaleInfo(tailscaleExe);
    if (statusOnly) {
      console.log(runTailscale(tailscaleExe, ['serve', 'status'], 'Tailscale serve status'));
      printUrls(info);
      return;
    }

    configureServe(tailscaleExe);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  printUrls(info);

  if (serveOnly) {
    return;
  }

  const children = [startProcess('dev servers', 'npm run dev')];

  const shutdown = () => {
    children.forEach((child) => child.kill('SIGINT'));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main();
