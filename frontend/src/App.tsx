import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import AdminApp from './AdminApp';
import SurveyModal from './Components/SurveyModal';

type ResultFile = {
  name: string;
  size: number;
  type: string;
  url: string;
};

type SurveyPayload = {
  purpose: string;
  additions: string;
  contact: string;
};

type ProgressState = {
  done: number;
  total: number;
  status: string;
};

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

const normalizeBase = (base: string) => base.replace(/\/$/, '');

const getFilenameFromDisposition = (header: string, fallback: string) => {
  if (!header) {
    return fallback;
  }
  const encodedMatch = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return fallback;
    }
  }
  const plainMatch = /filename="?([^"]+)"?/i.exec(header);
  return plainMatch?.[1] || fallback;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const isAdminRequest = () => {
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  return hostname.startsWith('admin.') || pathname.startsWith('/admin');
};

function MainApp() {
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultFile | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [surveySubmitted, setSurveySubmitted] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const endpoint = useMemo(() => `${normalizeBase(API_BASE)}/process`, []);
  const sessionStartEndpoint = useMemo(() => `${normalizeBase(API_BASE)}/session/start`, []);
  const sessionEndEndpoint = useMemo(() => `${normalizeBase(API_BASE)}/session/end`, []);
  const surveyEndpoint = useMemo(() => `${normalizeBase(API_BASE)}/survey`, []);
  const progressEndpoint = useMemo(() => `${normalizeBase(API_BASE)}/progress`, []);

  useEffect(() => {
    if (!result?.url) return;
    return () => URL.revokeObjectURL(result.url);
  }, [result?.url]);

  useEffect(() => {
    let active = true;
    const startSession = async () => {
      try {
        const response = await fetch(sessionStartEndpoint, { method: 'POST' });
        if (!response.ok) return;
        const payload = await response.json();
        if (active && payload?.session_id) {
          setSessionId(payload.session_id);
        }
      } catch {
        // Session tracking is optional.
      }
    };
    startSession();
    return () => {
      active = false;
    };
  }, [sessionStartEndpoint]);

  useEffect(() => {
    if (!sessionId) return;
    const sendEnd = () => {
      const payload = JSON.stringify({ session_id: sessionId });
      navigator.sendBeacon(sessionEndEndpoint, new Blob([payload], { type: 'application/json' }));
    };
    window.addEventListener('beforeunload', sendEnd);
    return () => {
      window.removeEventListener('beforeunload', sendEnd);
      sendEnd();
    };
  }, [sessionEndEndpoint, sessionId]);

  useEffect(() => {
    if (!result || !sessionId || surveySubmitted) return;
    const shownKey = `stroky_survey_shown_${sessionId}`;
    if (sessionStorage.getItem(shownKey)) return;
    sessionStorage.setItem(shownKey, '1');
    setSurveyOpen(true);
  }, [result, sessionId, surveySubmitted]);

  useEffect(() => {
    if (status !== 'loading' || !sessionId) {
      setProgress(null);
      return;
    }
    let active = true;
    const fetchProgress = async () => {
      try {
        const response = await fetch(`${progressEndpoint}?session_id=${encodeURIComponent(sessionId)}`);
        if (!response.ok) return;
        const payload = await response.json();
        if (active) {
          setProgress(payload);
        }
      } catch {
        // Progress is optional.
      }
    };
    fetchProgress();
    const timer = window.setInterval(fetchProgress, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [progressEndpoint, sessionId, status]);


  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setResult(null);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError('Выберите CSV или XLSX файл.');
      setStatus('error');
      return;
    }
    if (!query.trim()) {
      setError('Введите запрос.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('query', query);
    if (sessionId) {
      formData.append('session_id', sessionId);
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Ошибка обработки файла.');
      }
      const blob = await response.blob();
      const fallbackName = file.name
        ? file.name.replace(/(\.[^./\\]+)$/, '_filled$1')
        : 'result.csv';
      const filename = getFilenameFromDisposition(
        response.headers.get('content-disposition') || '',
        fallbackName
      );
      const url = URL.createObjectURL(blob);

      setResult({
        name: filename,
        size: blob.size,
        type: blob.type || 'application/octet-stream',
        url,
      });
      setStatus('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось выполнить запрос.';
      setError(message);
      setStatus('error');
    }
  };

  const handleSurveySubmit = async (values: SurveyPayload) => {
    if (!sessionId) {
      setSurveyError('Не удалось определить сессию. Попробуйте позже.');
      return;
    }
    setSurveyError(null);
    const response = await fetch(surveyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, ...values }),
    });
    if (!response.ok) {
      const message = await response.text();
      setSurveyError(message || 'Не удалось отправить опрос.');
      return;
    }
    setSurveySubmitted(true);
    setSurveyOpen(false);
  };

  const progressPct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div className="page">
      <header className="page-title">
        <div className="page-title-brand">
          <span className="page-title-logo">Stroki</span>
          <span className="page-title-badge">демо</span>
        </div>
        <p className="page-title-tagline">
          Загружайте таблицы — мы найдём данные для каждой строки автоматически
        </p>
        <p className="page-title-note">
          В демо-режиме обрабатывается до 300 строк. Загрузите CSV или XLSX и опишите задачу одной фразой.
        </p>
      </header>

      <SurveyModal
        isOpen={surveyOpen}
        onClose={() => setSurveyOpen(false)}
        onSubmit={handleSurveySubmit}
      />

      {surveyError && <div className="inline-error">{surveyError}</div>}

      <main>
        <form className="card" onSubmit={handleSubmit}>
          <div className="card-header">
            <h2>Загрузите файл и опишите задачу</h2>
            <p>
              Модель сама разберёт структуру таблицы, выберет нужные колонки и вернёт заполненный файл.
            </p>
          </div>

          <div className="form-grid">
            <label className="field">
              <span className="field-label">Файл с данными</span>
              <div className="file-drop-zone">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xlsm,.xltx,.xltm"
                  onChange={handleFileChange}
                  className="file-input-native"
                />
                {file ? (
                  <span className="file-chosen">
                    <span className="file-chosen-icon">✓</span>
                    {file.name}
                    <span className="file-chosen-size">{formatBytes(file.size)}</span>
                  </span>
                ) : (
                  <span className="file-placeholder">
                    Выберите файл или перетащите сюда
                  </span>
                )}
              </div>
              <span className="field-hint">
                Форматы: CSV, XLSX · Максимум 300 строк в демо-режиме
              </span>
            </label>

            <label className="field">
              <span className="field-label">Задача</span>
              <textarea
                rows={4}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Например: найди отрасль и сайт компании, без картинок"
              />
              <span className="field-hint">
                Опишите, что нужно найти для каждой строки. Если изображения не нужны — так и напишите.
              </span>
            </label>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Обрабатываем...' : 'Запустить'}
            </button>

            {result && (
              <a className="ghost download-link" href={result.url} download={result.name}>
                ↓ Скачать результат
              </a>
            )}

            {status === 'loading' && progress && progress.total > 0 ? (
              <div className="progress">
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="progress-text">
                  {progress.done} / {progress.total}
                  {progress.status ? <span className="progress-status"> · {progress.status}</span> : null}
                </span>
              </div>
            ) : null}

            <div className="status">
              {status === 'success' && result ? (
                <span className="status-success">
                  Готово! {result.name} · {formatBytes(result.size)}
                </span>
              ) : null}
              {status === 'error' && error ? <span className="error">{error}</span> : null}
            </div>
          </div>
        </form>

        <section className="tips">
          <div className="tips-text">
            <h3>Как это работает</h3>
            <ul>
              <li>
                <strong>Колонки выбираются автоматически</strong> — модель читает заголовки и сама решает,
                какие данные использовать как входные.
              </li>
              <li>
                <strong>Картинки опциональны</strong> — если они не нужны, укажите это явно в запросе,
                чтобы ускорить обработку.
              </li>
              <li>
                <strong>Результат — отдельный файл</strong> — исходник не меняется, вы получаете новый
                файл с суффиксом <code>_filled</code>.
              </li>
            </ul>
          </div>
          <div className="tips-examples">
            <div className="tips-card">
              <p className="tips-title">Пример — компании</p>
              <code>Найди отрасль и официальный сайт компании, картинки не нужны</code>
            </div>
            <div className="tips-card">
              <p className="tips-title">Пример — маркетинг</p>
              <code>Напиши короткое описание продукта и подбери 2 изображения для лендинга</code>
            </div>
            <div className="tips-card">
              <p className="tips-title">Пример — аналитика</p>
              <code>Определи страну и город по адресу, добавь координаты из открытых источников</code>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  if (isAdminRequest()) {
    return <AdminApp />;
  }

  return <MainApp />;
}
