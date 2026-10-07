import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import type { AuthSnapshot } from './AuthContext';

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
}

const ACCESS_TOKEN_KEY = 'timeplan.accessToken';
const REFRESH_TOKEN_KEY = 'timeplan.refreshToken';
const USER_NAME_KEY = 'timeplan.userName';
const VERIFIER_KEY = 'timeplan.pkceVerifier';
const STATE_KEY = 'timeplan.pkceState';
const RETURN_PATH_KEY = 'timeplan.returnPath';
const issuer = (import.meta.env.VITE_OIDC_ISSUER || '').replace(/\/$/, '');
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID || '';
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const basePath = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshTimer: number | null = null;
let refreshOperation: Promise<string> | null = null;
let authRevision = 0;
let sessionSequence = 0;
let initialization: Promise<void> | null = null;
let snapshot: AuthSnapshot = {
  status: 'initializing',
  userName: '',
  userId: null,
  sessionKey: 'initial',
  error: null,
};
const subscribers = new Set<(next: AuthSnapshot) => void>();

function publish(next: Partial<AuthSnapshot> & Pick<AuthSnapshot, 'status'>): void {
  snapshot = { ...snapshot, ...next };
  subscribers.forEach((subscriber) => subscriber(snapshot));
}

function createSessionKey(): string {
  sessionSequence += 1;
  return `${Date.now()}-${sessionSequence}`;
}

function getRedirectUri(): string {
  return new URL(basePath, window.location.origin).href;
}

function requireConfig(): void {
  if (!issuer || !clientId) {
    throw new Error('Authentication configuration is incomplete. Set VITE_OIDC_ISSUER and VITE_OIDC_CLIENT_ID.');
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getUserName(claims: Record<string, unknown>): string {
  for (const key of ['name', 'preferred_username', 'email', 'nickname']) {
    if (typeof claims[key] === 'string' && claims[key]) return claims[key];
  }
  return 'Felhasználó';
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

async function discover(): Promise<{ authorization_endpoint: string }> {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
  return response.json() as Promise<{ authorization_endpoint: string }>;
}

function clearTokens(): void {
  authRevision += 1;
  accessToken = null;
  refreshToken = null;
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_NAME_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(RETURN_PATH_KEY);
}

function applyTokens(tokens: TokenResponse): void {
  if (!tokens.access_token) throw new Error('OIDC token response contained no access token');
  accessToken = tokens.access_token;
  if (tokens.refresh_token) refreshToken = tokens.refresh_token;
  const claims = decodeJwtPayload(tokens.id_token || accessToken);
  const accessClaims = decodeJwtPayload(accessToken);
  const userName = getUserName(claims);
  const userId = typeof accessClaims.sub === 'string'
    ? accessClaims.sub
    : (typeof claims.sub === 'string' ? claims.sub : null);
  const sessionKey = snapshot.status === 'authenticated' && snapshot.userId === userId
    ? snapshot.sessionKey
    : createSessionKey();
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(USER_NAME_KEY, userName);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  scheduleRefresh(typeof claims.exp === 'number' ? claims.exp : undefined);
  publish({ status: 'authenticated', userName, userId, sessionKey, error: null });
}

function scheduleRefresh(expiration?: number): void {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = null;
  if (!expiration || !refreshToken) return;
  const delay = Math.max(expiration * 1000 - Date.now() - 60_000, 5_000);
  refreshTimer = window.setTimeout(() => {
    void refreshAccessToken().catch((error: unknown) => {
      logoutAuth();
      publish({
        status: 'error',
        userName: '',
        error: error instanceof Error ? error.message : 'Token refresh failed',
      });
    });
  }, delay);
}

async function readTokenResponse(response: Response): Promise<TokenResponse> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Authentication request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as TokenResponse;
}

async function refreshAccessToken(): Promise<string> {
  if (refreshOperation) return refreshOperation;
  if (!refreshToken) throw new Error('No refresh token is available');
  const revision = authRevision;
  const currentRefreshToken = refreshToken;
  refreshOperation = (async () => {
    const response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: currentRefreshToken }),
    });
    const tokens = await readTokenResponse(response);
    if (revision !== authRevision) throw new Error('Session ended before token refresh completed');
    applyTokens(tokens);
    if (!accessToken) throw new Error('Refresh response contained no access token');
    return accessToken;
  })();
  try {
    return await refreshOperation;
  } finally {
    refreshOperation = null;
  }
}

function logoutAuth(): void {
  clearTokens();
  publish({
    status: 'anonymous',
    userName: '',
    userId: null,
    sessionKey: createSessionKey(),
    error: null,
  });
}

async function exchangeCallback(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const callbackError = params.get('error');
  if (callbackError) {
    const description = params.get('error_description');
    throw new Error(`OIDC authorization failed: ${callbackError}${description ? ` (${description})` : ''}`);
  }

  const code = params.get('code');
  if (!code) return;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  if (!verifier || !expectedState || params.get('state') !== expectedState) {
    throw new Error('Invalid OIDC state');
  }

  const response = await fetch(`${apiBaseUrl}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: verifier,
      redirect_uri: getRedirectUri(),
    }),
  });
  const tokens = await readTokenResponse(response);
  applyTokens(tokens);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  const requestedPath = sessionStorage.getItem(RETURN_PATH_KEY);
  const returnPath = requestedPath?.startsWith('/') && !requestedPath.startsWith('//')
    ? requestedPath
    : basePath;
  sessionStorage.removeItem(RETURN_PATH_KEY);
  window.history.replaceState(null, '', returnPath);
}

async function initializeAuth(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      requireConfig();
      accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
      refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      await exchangeCallback();

      if (accessToken) {
        const claims = decodeJwtPayload(accessToken);
        const expiration = typeof claims.exp === 'number' ? claims.exp : undefined;
        const expiresSoon = !expiration || expiration * 1000 - Date.now() < 60_000;
        if (expiresSoon && refreshToken) {
          await refreshAccessToken();
        } else if (expiresSoon) {
          clearTokens();
        } else {
          scheduleRefresh(expiration);
          publish({
            status: 'authenticated',
            userName: localStorage.getItem(USER_NAME_KEY) || getUserName(claims),
            userId: typeof claims.sub === 'string' ? claims.sub : null,
            sessionKey: createSessionKey(),
            error: null,
          });
        }
      }

      if (!accessToken) publish({ status: 'anonymous', userName: '', userId: null, error: null });
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch (error) {
      publish({
        status: 'error',
        userName: '',
        error: error instanceof Error ? error.message : 'Authentication initialization failed',
      });
    }
  })();
  return initialization;
}

function handleVisibilityChange(): void {
  if (document.visibilityState !== 'visible' || !accessToken) return;
  const claims = decodeJwtPayload(accessToken);
  if (typeof claims.exp === 'number' && claims.exp * 1000 - Date.now() < 60_000) {
    void refreshAccessToken().catch((error: unknown) => {
      logoutAuth();
      publish({
        status: 'error',
        userName: '',
        error: error instanceof Error ? error.message : 'Token refresh failed',
      });
    });
  }
}

async function loginAuth(): Promise<void> {
  requireConfig();
  const metadata = await discover();
  const verifier = randomBase64Url(32);
  const state = randomBase64Url(32);
  const challenge = await createCodeChallenge(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const currentParams = new URLSearchParams(window.location.search);
  const returnPath = currentParams.has('code') || currentParams.has('error')
    ? window.location.pathname
    : `${window.location.pathname}${window.location.search}`;
  sessionStorage.setItem(RETURN_PATH_KEY, returnPath);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    scope: 'openid profile email offline_access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(`${metadata.authorization_endpoint}?${params}`);
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T | null> {
  if (!accessToken) throw new Error('You must sign in to access planner data');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${apiBaseUrl}/api${path}`, { ...options, headers });

  if (response.status === 401) {
    if (!retried && refreshToken) {
      try {
        await refreshAccessToken();
        return request<T>(path, options, true);
      } catch {
        logoutAuth();
        throw new Error('Your session has expired. Please sign in again.');
      }
    }
    logoutAuth();
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!response.ok) {
    const message = (await response.text()).slice(0, 300);
    throw new Error(`API request failed (${response.status}): ${message}`);
  }
  if (response.status === 204) return null;
  return response.json() as Promise<T>;
}

async function requestForSession<T>(
  sessionKey: string,
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  if (snapshot.status !== 'authenticated' || snapshot.sessionKey !== sessionKey) {
    throw new Error('Authentication session changed');
  }
  try {
    return await request<T>(path, options);
  } catch (error) {
    if (snapshot.status !== 'authenticated' || snapshot.sessionKey !== sessionKey) {
      throw new Error('Authentication session changed', { cause: error });
    }
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState(snapshot);

  useEffect(() => {
    subscribers.add(setCurrent);
    void initializeAuth();
    return () => {
      subscribers.delete(setCurrent);
    };
  }, []);

  return (
    <AuthContext.Provider value={{
      ...current,
      login: loginAuth,
      logout: logoutAuth,
      request,
      requestForSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
}