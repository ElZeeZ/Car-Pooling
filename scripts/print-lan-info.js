const os = require('node:os');

const clientPort = process.env.VITE_DEV_PORT || process.env.CLIENT_PORT || '5173';
const apiPort = process.env.PORT || process.env.API_PORT || '5000';
const interfaces = os.networkInterfaces();
const addresses = Object.values(interfaces)
  .flat()
  .filter(
    (item) =>
      item &&
      item.family === 'IPv4' &&
      !item.internal &&
      /^(10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.|100\.)/.test(item.address)
  )
  .map((item) => item.address);

const uniqueAddresses = [...new Set(addresses)];

console.log('');
console.log('Smart Carpooling LAN dev');
console.log(`Frontend: http://localhost:${clientPort}`);
console.log(`Backend:  http://localhost:${apiPort}/api/health`);

if (uniqueAddresses.length === 0) {
  console.log('No private LAN/VPN IPv4 address was detected yet.');
  console.log('Connect to Wi-Fi or Tailscale/Radmin, then run npm run dev:lan again.');
} else {
  console.log('');
  console.log('Open one of these from your phone/laptop:');
  uniqueAddresses.forEach((address) => {
    console.log(`- http://${address}:${clientPort}`);
  });
  console.log('');
  console.log('Backend health checks:');
  uniqueAddresses.forEach((address) => {
    console.log(`- http://${address}:${apiPort}/api/health`);
  });
}

console.log('');
