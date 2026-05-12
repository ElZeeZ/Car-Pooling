import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import routes from './routes/index.js';

const app = express();

const allowedOrigins = new Set(
  env.clientOrigins.length > 0 ? env.clientOrigins : [env.clientOrigin]
);

const isAllowedDevOrigin = (origin) =>
  env.nodeEnv !== 'production' &&
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:\d+)?$/.test(
    origin
  );

const isAllowedTailscaleOrigin = (origin) =>
  env.nodeEnv !== 'production' &&
  /^https:\/\/[a-z0-9.-]+\.ts\.net(:\d+)?$/i.test(
    origin
  );

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.has(origin) ||
        isAllowedDevOrigin(origin) ||
        isAllowedTailscaleOrigin(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true
  })
);
app.use(express.json());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/', (req, res) => {
  res.json({
    name: 'Smart Carpooling API',
    status: 'running',
    docs: '/api/health'
  });
});

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
