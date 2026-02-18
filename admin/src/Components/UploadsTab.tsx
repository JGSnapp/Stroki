import { useEffect, useState, useCallback } from 'react';

type Upload = {
  id: string;
  session_id: string;
  original_name: string;
  stored_name: string;
  mime: string;
  size_bytes: number;
  sha256: string;
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

export default function UploadsTab({ token }: Props) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/uploads?limit=300', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUploads(await res.json());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = uploads.filter((u) =>
    !search ||
    u.original_name.toLowerCase().includes(search.toLowerCase()) ||
    u.session_id.includes(search)
  );
  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  return (
    <div>
      <div className="page-header">
        <h1>Загрузки</h1>
        <p>Все файлы, загруженные пользователями</p>
      </div>

      <div className="filter-row">
        <input
          className="filter-input"
          placeholder="Поиск по имени файла или ID сессии..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <button className="btn-sm" onClick={load}>↻ Обновить</button>
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem', alignSelf: 'center' }}>
          {filtered.length} файлов
        </span>
      </div>

      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Имя файла</th>
                <th>Формат</th>
                <th>Размер</th>
                <th>Сессия</th>
                <th>Загружен</th>
                <th>SHA256</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="loading-row"><td colSpan={6}>Загрузка...</td></tr>
              )}
              {!loading && paged.length === 0 && (
                <tr className="loading-row"><td colSpan={6}>Нет данных</td></tr>
              )}
              {paged.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.original_name}</td>
                  <td>
                    <span className="badge badge-orange">
                      {u.mime.includes('csv') ? 'CSV' : 'XLSX'}
                    </span>
                  </td>
                  <td className="muted">{fmtBytes(u.size_bytes)}</td>
                  <td><span className="monospace">{u.session_id.slice(0, 8)}…</span></td>
                  <td className="muted">{fmtDate(u.created_at)}</td>
                  <td><span className="monospace">{u.sha256.slice(0, 10)}…</span></td>
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
