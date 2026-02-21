import { useEffect, useState, useCallback } from 'react';

type Result = {
  id: string;
  session_id: string;
  upload_original_name: string;
  result_name: string;
  stored_name: string;
  size_bytes: number;
  query: string;
  rows_processed: number;
  created_at: string;
};

type Props = { token: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

const fmtBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
};

export default function ResultsTab({ token }: Props) {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/results?limit=300', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setResults(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (id: string, name: string) => {
    const res = await fetch(`/api/admin/results/${id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = results.filter((r) =>
    !search ||
    r.result_name.toLowerCase().includes(search.toLowerCase()) ||
    r.query.toLowerCase().includes(search.toLowerCase()) ||
    r.session_id.includes(search)
  );
  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  return (
    <div>
      <div className="page-header">
        <h1>Результаты</h1>
        <p>Сохранённые обработанные файлы с возможностью скачивания</p>
      </div>

      <div className="filter-row">
        <input
          className="filter-input"
          placeholder="Поиск по имени файла или запросу..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <button className="btn-sm" onClick={load}>↻ Обновить</button>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem', alignSelf: 'center' }}>
          {filtered.length} результатов
        </span>
      </div>

      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Файл результата</th>
                <th>Исходный файл</th>
                <th>Запрос</th>
                <th>Строк</th>
                <th>Размер</th>
                <th>Дата</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="loading-row"><td colSpan={7}>Загрузка...</td></tr>
              )}
              {!loading && paged.length === 0 && (
                <tr className="loading-row"><td colSpan={7}>Нет данных</td></tr>
              )}
              {paged.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.result_name}</td>
                  <td className="muted">{r.upload_original_name}</td>
                  <td>
                    <span style={{ fontSize: '0.82rem', color: 'var(--ink)', maxWidth: 240, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.query}
                    </span>
                  </td>
                  <td className="muted">{r.rows_processed}</td>
                  <td className="muted">{fmtBytes(r.size_bytes)}</td>
                  <td className="muted">{fmtDate(r.created_at)}</td>
                  <td>
                    <button className="btn-sm" onClick={() => handleDownload(r.id, r.result_name)}>
                      ↓ Скачать
                    </button>
                  </td>
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
