import { useState, useEffect, useCallback } from 'react';
import LoginPage from './Components/LoginPage';
import Dashboard from './Components/Dashboard';

export type AuthToken = string | null;

const TOKEN_KEY = 'stroki_admin_token';

export default function App() {
  const [token, setToken] = useState<AuthToken>(() => sessionStorage.getItem(TOKEN_KEY));

  const handleLogin = useCallback((t: string) => {
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  // Verify token on mount
  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => {
      if (!r.ok) handleLogout();
    }).catch(() => handleLogout());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <Dashboard token={token} onLogout={handleLogout} />;
}
