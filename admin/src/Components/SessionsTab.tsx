import { useEffect, useState, useCallback } from 'react';

type Session = {
  id: string;
  started_at: string;
  ended_at: string | null;
  user_agent: string | null;
  referrer: string | null;
  uploads_count: number;
  results_count: number;
};

type Props = { token: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

const duration = (start: string, end: string | null) => {
  if (!end) return 'активна';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}с`;
  if (s < 3600) return `${Math.floor(s / 60)}м`;
  return `${Math.floor(s / 3600)}ч ${Math.floor((s % 3600) / 60)}м`;
};

export default function SessionsTab({ token }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSessions(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = sessions.filter((s) =>
    !search || s.id.includes(search) || (s.referrer || '').includes(search)
  );
  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  return (
    <div>
      <div className="page-header">
        <h1>Сессии</h1>
        <p>Все пользовательские сессии и их активность</p>
      </div>

      <div className="filter-row">
        <input
          className="filter-input"
          placeholder="Поиск по ID или реферреру..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <button className="btn-sm" onClick={load}>↻ Обновить</button>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem', alignSelf: 'center' }}>
          {filtered.length} сессий
        </span>
      </div>

      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Начало</th>
                <th>Длительность</th>
                <th>Загрузок</th>
                <th>Результатов</th>
                <th>Реферрер</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="loading-row"><td colSpan={6}>Загрузка...</td></tr>
              )}
              {!loading && paged.length === 0 && (
                <tr className="loading-row"><td colSpan={6}>Нет данных</td></tr>
              )}
              {paged.map((s) => (
                <tr key={s.id}>
                  <td><span className="monospace">{s.id.slice(0, 8)}…</span></td>
                  <td className="muted">{fmtDate(s.started_at)}</td>
                  <td>
                    <span className={`badge ${s.ended_at ? 'badge-gray' : 'badge-green'}`}>
                      {duration(s.started_at, s.ended_at)}
                    </span>
                  </td>
                  <td>{s.uploads_count}</td>
                  <td>{s.results_count}</td>
                  <td className="muted">{s.referrer || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Назад</button>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{page + 1} / {totalPages}</span>
          <button className="btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
        </div>
      )}
    </div>
  );
}
