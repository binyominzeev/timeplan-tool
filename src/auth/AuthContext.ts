import { createContext } from 'react';

export type AuthStatus = 'initializing' | 'anonymous' | 'authenticated' | 'error';

export interface AuthSnapshot {
  status: AuthStatus;
  userName: string;
  userId: string | null;
  sessionKey: string;
  error: string | null;
}

export interface AuthContextValue extends AuthSnapshot {
  login: () => Promise<void>;
  logout: () => void;
  request: <T>(path: string, options?: RequestInit) => Promise<T | null>;
  requestForSession: <T>(sessionKey: string, path: string, options?: RequestInit) => Promise<T | null>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);