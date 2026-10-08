import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createRequireAuth } from '../src/auth.js';
import { createApp } from '../src/index.js';
import { createDatabase } from '../src/db.js';

const emptyDocument = {
  state: {
    activities: [],
    schedule: [],
    dailySchedule: [],
    dailyScheduleDate: '2026-10-06',
    starredActivityIds: [],
    days: ['Mon'],
    dayLabels: { Mon: 'Monday' },
  },
  favorites: [null, null, null, null],
};

test('validates JWT issuer and subject and fails closed without configuration', async () => {
  const issuer = 'https://auth.example.test';
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const authenticate = createRequireAuth({
    configuredIssuer: issuer,
    configuredJwks: createLocalJWKSet({ keys: [jwk] }),
  });
  const token = await new SignJWT({ role: 'planner' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer)
    .setSubject('alice')
    .setExpirationTime('5m')
    .sign(privateKey);

  let statusCode = 200;
  let responseBody;
  const response = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };
  const request = { get: () => `Bearer ${token}` };
  let nextCalled = false;
  await authenticate(request, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(request.user.id, 'alice');

  const invalidRequest = { get: () => 'Bearer invalid-token' };
  await authenticate(invalidRequest, response, () => { nextCalled = true; });
  assert.equal(statusCode, 401);
  assert.deepEqual(responseBody, { error: 'Invalid access token' });

  const unconfigured = createRequireAuth({ configuredIssuer: null, configuredJwks: null });
  await unconfigured(invalidRequest, response, () => { nextCalled = true; });
  assert.equal(statusCode, 503);
  assert.deepEqual(responseBody, { error: 'Authentication is not configured' });
});

async function withApi(run) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'timeplan-api-'));
  const database = createDatabase(path.join(directory, 'test.db'));
  const webDistPath = path.join(directory, 'dist');
  mkdirSync(webDistPath);
  writeFileSync(path.join(webDistPath, 'index.html'), '<!doctype html><title>TimePlan test</title>');
  const app = createApp({
    database,
    webDistPath,
    authenticate(req, res, next) {
      const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (!token) return res.status(401).json({ error: 'Bearer token required' });
      req.user = { id: token };
      return next();
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('requires authentication and validates state documents', async () => {
  await withApi(async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/api/state`);
    assert.equal(unauthorized.status, 401);

    const invalid = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: {} }),
    });
    assert.equal(invalid.status, 400);

    const invalidCompletion = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...emptyDocument,
        state: { ...emptyDocument.state, completions: [{ entryId: 'entry-1' }] },
      }),
    });
    assert.equal(invalidCompletion.status, 400);
  });
});

test('serves the built app from the same process as the API', async () => {
  await withApi(async (baseUrl) => {
    const page = await fetch(`${baseUrl}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /TimePlan test/);
  });
});

test('stores planner data separately for each authenticated subject', async () => {
  await withApi(async (baseUrl) => {
    const save = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json' },
      body: JSON.stringify(emptyDocument),
    });
    assert.equal(save.status, 200);
    assert.deepEqual((await save.json()).document, emptyDocument);

    const alice = await fetch(`${baseUrl}/api/state`, {
      headers: { Authorization: 'Bearer alice' },
    });
    assert.deepEqual((await alice.json()).document, emptyDocument);

    const completedDocument = {
      ...emptyDocument,
      state: {
        ...emptyDocument.state,
        completions: [{
          entryId: 'entry-1',
          activityId: 'activity-1',
          activityName: 'Review notes',
          category: 'Work',
          date: '2026-10-08',
          startTime: '09:00',
          endTime: '09:30',
          completedAt: '2026-10-08T09:31:00.000Z',
        }],
      },
    };
    const completionSave = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer alice', 'Content-Type': 'application/json' },
      body: JSON.stringify(completedDocument),
    });
    assert.equal(completionSave.status, 200);
    assert.deepEqual((await completionSave.json()).document, completedDocument);

    const bob = await fetch(`${baseUrl}/api/state`, {
      headers: { Authorization: 'Bearer bob' },
    });
    assert.equal(await bob.json(), null);
  });
});