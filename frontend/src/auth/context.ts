import { createContext, useContext } from 'react';
import type { PanelUser } from '../services/api';

export interface AuthState {
  user: PanelUser | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<PanelUser>;
  logout: () => Promise<void>;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider ausente.');
  return value;
}
