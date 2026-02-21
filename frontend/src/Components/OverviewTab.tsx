import { useEffect, useState, useCallback } from 'react';

type Stats = {
  total_visitors: number;
  total_sessions: number;
  total_uploads: number;
  total_results: number;
  total_surveys: number;
  sessions_today: number;
  uploads_today: number;
  results_today: number;
};

type Props = { token: string };

const fmt = (n: number) => n.toLocaleString('ru-RU');

export default function OverviewTab({ token }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setLastRefresh(new Date().toLocaleTimeString('ru-RU'));
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1>Обзор</h1></div>
        <p style={{ color: 'var(--muted)' }}>Загрузка...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <div className="page-header"><h1>Обзор</h1></div>
        <p style={{ color: 'var(--red)' }}>Не удалось загрузить данные.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Обзор</h1>
        <div className="refresh-bar">
          <span>Обновлено: {lastRefresh}</span>
          <button className="btn-sm" onClick={load}>↻ Обновить</button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-label">Уникальных посетителей</p>
          <p className="stat-value">{fmt(stats.total_visitors)}</p>
          <p className="stat-sub">за всё время</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Сессий всего</p>
          <p className="stat-value">{fmt(stats.total_sessions)}</p>
          <p className="stat-sub">сегодня: {fmt(stats.sessions_today)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Загрузок файлов</p>
          <p className="stat-value">{fmt(stats.total_uploads)}</p>
          <p className="stat-sub">сегодня: {fmt(stats.uploads_today)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Результатов</p>
          <p className="stat-value">{fmt(stats.total_results)}</p>
          <p className="stat-sub">сегодня: {fmt(stats.results_today)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Опросов</p>
          <p className="stat-value">{fmt(stats.total_surveys)}</p>
          <p className="stat-sub">за всё время</p>
        </div>
      </div>
    </div>
  );
}
