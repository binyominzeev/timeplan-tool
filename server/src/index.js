import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase } from './db.js';
import { createRoutes } from './routes.js';

const require = createRequire(import.meta.url);
const devPorts = require('../../dev-ports.json');
const defaultWebDistPath = fileURLToPath(new URL('../../dist/', import.meta.url));

export function createApp({ database, authenticate, webDistPath = defaultWebDistPath } = {}) {
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    methods: ['GET', 'POST', 'PUT'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use('/api', createRoutes({ database, authenticate }));
  if (fs.existsSync(webDistPath)) {
    app.get('/', (req, res) => res.redirect(308, '/timeplan/'));
    app.get('/timeplan', (req, res, next) => {
      if (req.path === '/timeplan') return res.redirect(308, '/timeplan/');
      return next();
    });
    app.use('/timeplan', express.static(webDistPath));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    if (error.status === 413) return res.status(413).json({ error: 'Request body is too large' });
    console.error('[api] request failed', error);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  const port = process.env.NODE_ENV === 'production'
    ? Number(process.env.PORT || devPorts.api)
    : devPorts.api;
  const database = createDatabase(process.env.DATABASE_PATH || './data/timeplan.db');
  createApp({ database }).listen(port, '127.0.0.1', () => {
    console.log(`API listening on 127.0.0.1:${port}`);
  });
}