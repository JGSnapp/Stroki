import { useCallback, useEffect, useState } from 'react';
import LoginPage from './Components/LoginPage';
import Dashboard from './Components/Dashboard';

export type AuthToken = string | null;

const TOKEN_KEY = 'stroki_admin_token';

export default function AdminApp() {
  const [token, setToken] = useState<AuthToken>(() => sessionStorage.getItem(TOKEN_KEY));

  const handleLogin = useCallback((nextToken: string) => {
    sessionStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('/api/admin/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) handleLogout();
      })
      .catch(() => handleLogout());
  }, [handleLogout, token]);

  return (
    <div className="admin-root">
      {token ? <Dashboard token={token} onLogout={handleLogout} /> : <LoginPage onLogin={handleLogin} />}
    </div>
  );
}
