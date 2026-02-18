import { useState } from 'react';
import { useForm } from 'react-hook-form';

type LoginForm = { username: string; password: string };

type Props = { onLogin: (token: string) => void };

export default function LoginPage({ onLogin }: Props) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginForm>();
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: LoginForm) => {
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || 'Неверный логин или пароль.');
        return;
      }
      const data = await res.json();
      onLogin(data.token);
    } catch {
      setError('Не удалось подключиться к серверу.');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo">Stroki</span>
          <span className="login-badge">admin</span>
        </div>
        <h2 className="login-title">Вход в панель управления</h2>
        {error && <div className="login-error">{error}</div>}
        <form className="login-form" onSubmit={handleSubmit(onSubmit)}>
          <label className="field">
            <span className="field-label">Логин</span>
            <input
              type="text"
              autoComplete="username"
              {...register('username', { required: true })}
              placeholder="admin"
            />
          </label>
          <label className="field">
            <span className="field-label">Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              {...register('password', { required: true })}
              placeholder="••••••••"
            />
          </label>
          <button className="btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
