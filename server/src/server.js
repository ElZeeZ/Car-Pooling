import app from './app.js';
import { env } from './config/env.js';
import { pool, testConnection } from './config/db.js';

const server = app.listen(env.port, async () => {
  console.log(`API server listening on http://localhost:${env.port}`);

  try {
    await testConnection();
    console.log('Database connection verified.');
  } catch (error) {
    console.warn('Database connection could not be verified:', error.message);
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${env.port} is already in use. Stop the old dev server or run npm.cmd run dev:stop, then start again.`
    );
    process.exit(1);
  }

  throw error;
});

const shutdown = async () => {
  console.log('Shutting down API server...');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
