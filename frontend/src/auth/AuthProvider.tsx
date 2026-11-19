import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { authService } from '../services/api';
import type { PanelUser } from '../services/api';
import { AuthContext } from './context';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PanelUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const current = await authService.me();
      if (request === generation.current) setUser(current);
    } catch (failure) {
      if (request !== generation.current) return;
      setUser(null);
      if (!(axios.isAxiosError(failure) && failure.response?.status === 401)) setError('Não foi possível verificar sua sessão. Confira a conexão e tente novamente.');
    } finally { if (request === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    // Descarta somente o mecanismo antigo; essa flag nunca autentica uma requisição.
    localStorage.removeItem('authenticated');
    const expired = () => { generation.current++; setUser(null); setLoading(false); setError(''); };
    window.addEventListener('panel-session-expired', expired);
    const request = ++generation.current;
    let active = true;
    authService.me().then(current => { if (active && request === generation.current) setUser(current); })
      .catch(failure => {
        if (!active || request !== generation.current) return;
        setUser(null);
        if (!(axios.isAxiosError(failure) && failure.response?.status === 401)) setError('Não foi possível verificar sua sessão. Confira a conexão e tente novamente.');
      })
      .finally(() => { if (active && request === generation.current) setLoading(false); });
    return () => { active = false; window.removeEventListener('panel-session-expired', expired); };
  }, [refresh]);
  const login = async (username: string, password: string) => {
    generation.current++;
    const current = await authService.login(username, password);
    setUser(current); setLoading(false); setError('');
    return current;
  };
  const logout = async () => {
    await authService.logout();
    generation.current++; setUser(null); setLoading(false); setError('');
  };
  return <AuthContext.Provider value={{ user, loading, error, refresh, login, logout }}>{children}</AuthContext.Provider>;
}
