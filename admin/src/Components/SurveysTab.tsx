import { useEffect, useState, useCallback } from 'react';

type Survey = {
  id: string;
  session_id: string;
  purpose: string;
  additions: string;
  contact: string;
  created_at: string;
};

type Props = { token: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

export default function SurveysTab({ token }: Props) {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/surveys?limit=300', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSurveys(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = surveys.filter((s) =>
    !search ||
    s.purpose.toLowerCase().includes(search.toLowerCase()) ||
    s.contact.toLowerCase().includes(search.toLowerCase()) ||
    s.additions.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  return (
    <div>
      <div className="page-header">
        <h1>Опросы</h1>
        <p>Обратная связь от пользователей</p>
      </div>

      <div className="filter-row">
        <input
          className="filter-input"
          placeholder="Поиск по тексту или контакту..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <button className="btn-sm" onClick={load}>↻ Обновить</button>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem', alignSelf: 'center' }}>
          {filtered.length} ответов
        </span>
      </div>

      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Цель использования</th>
                <th>Что добавить</th>
                <th>Контакт</th>
                <th>Сессия</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="loading-row"><td colSpan={5}>Загрузка...</td></tr>
              )}
              {!loading && paged.length === 0 && (
                <tr className="loading-row"><td colSpan={5}>Нет данных</td></tr>
              )}
              {paged.map((s) => (
                <tr key={s.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.created_at)}</td>
                  <td><div className="survey-text">{s.purpose}</div></td>
                  <td><div className="survey-text">{s.additions}</div></td>
                  <td style={{ fontWeight: 500 }}>{s.contact}</td>
                  <td><span className="monospace">{s.session_id.slice(0, 8)}…</span></td>
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
