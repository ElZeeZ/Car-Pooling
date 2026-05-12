import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const numberOrDefault = (value, fallback) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseAllowedHosts = (value) => {
  if (value === 'true') {
    return true;
  }

  return value
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const clientPort = numberOrDefault(env.VITE_DEV_PORT, 5173);
  const apiPort = numberOrDefault(env.VITE_API_PORT, 5000);

  return {
    plugins: [react()],
    server: {
      host: env.VITE_DEV_HOST || '127.0.0.1',
      port: clientPort,
      strictPort: env.VITE_STRICT_PORT !== 'false',
      allowedHosts: parseAllowedHosts(env.VITE_ALLOWED_HOSTS || '.ts.net'),
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  };
});
