import { Router } from 'express';
import { requireAuth } from './auth.js';

const MAX_DOCUMENT_BYTES = 1_000_000;

function logAuthEvent(event, details = {}) {
  console.log(`[auth] ${new Date().toISOString()} ${event}`, JSON.stringify(details));
}

function isPlannerDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const document = value;
  if (!document.state || typeof document.state !== 'object' || Array.isArray(document.state)) return false;
  const state = document.state;
  if (
    !Array.isArray(state.activities) ||
    !Array.isArray(state.schedule) ||
    !Array.isArray(state.dailySchedule) ||
    !Array.isArray(state.starredActivityIds) ||
    !Array.isArray(state.days) ||
    !state.dayLabels || typeof state.dayLabels !== 'object' || Array.isArray(state.dayLabels)
  ) return false;
  if (state.completions !== undefined && (
    !Array.isArray(state.completions) ||
    !state.completions.every((completion) => {
      if (!completion || typeof completion !== 'object' || Array.isArray(completion)) return false;
      const date = completion.date;
      const parsedDate = typeof date === 'string' ? new Date(`${date}T00:00:00Z`) : null;
      return (
        typeof completion.entryId === 'string' && completion.entryId.length > 0 &&
        typeof completion.activityId === 'string' && completion.activityId.length > 0 &&
        typeof completion.activityName === 'string' && completion.activityName.length > 0 &&
        typeof completion.category === 'string' &&
        typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date &&
        typeof completion.startTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(completion.startTime) &&
        typeof completion.endTime === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(completion.endTime) &&
        typeof completion.completedAt === 'string' && Number.isFinite(Date.parse(completion.completedAt))
      );
    })
  )) return false;
  if (document.ui !== undefined) {
    const ui = document.ui;
    if (!ui || typeof ui !== 'object' || Array.isArray(ui)) return false;
    for (const key of ['showProgressPanel', 'showActivities']) {
      if (ui[key] !== undefined && typeof ui[key] !== 'boolean') return false;
    }
  }
  if (!Array.isArray(document.favorites) || document.favorites.length !== 4) return false;
  return document.favorites.every((favorite) =>
    favorite === null || (
      favorite && typeof favorite === 'object' &&
      typeof favorite.name === 'string' &&
      favorite.data && typeof favorite.data === 'object'
    ),
  );
}

async function exchangeWithPocketId(grantParams) {
  const issuer = process.env.OIDC_ISSUER?.replace(/\/$/, '');
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) {
    return { status: 503, body: JSON.stringify({ error: 'OIDC server configuration is incomplete' }) };
  }

  const response = await fetch(`${issuer}/api/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...grantParams }),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await response.text() };
}

export function createRoutes({ database, authenticate = requireAuth } = {}) {
  const router = Router();

  router.post('/auth/token', async (req, res, next) => {
    const { code, code_verifier: codeVerifier, redirect_uri: redirectUri } = req.body || {};
    const configuredRedirectUri = process.env.OIDC_REDIRECT_URI;
    if (!configuredRedirectUri) {
      logAuthEvent('token.config_missing');
      return res.status(503).json({ error: 'OIDC server configuration is incomplete' });
    }
    if (
      typeof code !== 'string' || code.length === 0 ||
      typeof codeVerifier !== 'string' || codeVerifier.length < 43 || codeVerifier.length > 128 ||
      redirectUri !== configuredRedirectUri
    ) {
      logAuthEvent('token.invalid_request', {
        hasCode: typeof code === 'string',
        redirectUriMatches: redirectUri === configuredRedirectUri,
      });
      return res.status(400).json({ error: 'Invalid OIDC token request' });
    }

    try {
      const result = await exchangeWithPocketId({
        grant_type: 'authorization_code',
        code,
        redirect_uri: configuredRedirectUri,
        code_verifier: codeVerifier,
      });
      logAuthEvent(result.status === 200 ? 'token.success' : 'token.failed', { status: result.status });
      return res.status(result.status).type('application/json').send(result.body);
    } catch (error) {
      logAuthEvent('token.error', { message: error.message });
      return next(error);
    }
  });

  router.post('/auth/refresh', async (req, res, next) => {
    const { refresh_token: refreshToken } = req.body || {};
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      logAuthEvent('refresh.invalid_request');
      return res.status(400).json({ error: 'Invalid refresh request' });
    }
    try {
      const result = await exchangeWithPocketId({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      logAuthEvent(result.status === 200 ? 'refresh.success' : 'refresh.failed', { status: result.status });
      return res.status(result.status).type('application/json').send(result.body);
    } catch (error) {
      logAuthEvent('refresh.error', { message: error.message });
      return next(error);
    }
  });

  router.get('/state', authenticate, (req, res, next) => {
    try {
      return res.json(database.get(req.user.id));
    } catch (error) {
      return next(error);
    }
  });

  router.put('/state', authenticate, (req, res, next) => {
    const document = req.body;
    const byteLength = Buffer.byteLength(JSON.stringify(document ?? null));
    if (byteLength > MAX_DOCUMENT_BYTES || !isPlannerDocument(document)) {
      return res.status(400).json({ error: 'Invalid planner state document' });
    }
    try {
      return res.json(database.put(req.user.id, document));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}