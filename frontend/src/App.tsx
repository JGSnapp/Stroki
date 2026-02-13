import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
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

export default function App() {
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
        <h1>Strok1</h1>
        <p>Демо-режим: количество строк ограничено до 300.</p>
        <p className="page-title-note">
          Инструкция: загрузите CSV/XLSX, опишите задачу одной строкой и нажмите «Запустить».
        </p>
      </header>

      <header className="hero">
        <div>
          <p className="hero-tag">Stroki Agent</p>
          <h1>Автоматизируйте поиск и заполнение данных для каждой строки</h1>
          <p className="hero-subtitle">
            Загружайте CSV/XLSX, описывайте задачу одним запросом, а сервис сам выберет колонки и заполнит результат.
          </p>
        </div>
        <div className="hero-panel">
          <div>
            <p className="panel-label">Endpoint</p>
            <p className="panel-value">{endpoint}</p>
          </div>
          <div>
            <p className="panel-label">Формат</p>
            <p className="panel-value">CSV / XLSX</p>
          </div>
          <div>
            <p className="panel-label">Images</p>
            <p className="panel-value">Опционально до 5</p>
          </div>
        </div>
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
            <h2>Запуск обработки</h2>
            <p>
              Опишите задачу: что нужно найти для каждой строки и для чего подбирать картинки. Колонки выберет модель.
            </p>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Файл CSV/XLSX</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xlsm,.xltx,.xltm"
                onChange={handleFileChange}
              />
              {file ? (
                <span className="field-hint">
                  {file.name} · {formatBytes(file.size)}
                </span>
              ) : (
                <span className="field-hint">Выберите файл для загрузки</span>
              )}
            </label>

            <label className="field">
              <span>Введите запрос</span>
              <textarea
                rows={3}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найди отрасль и описание компании, подбери 3 изображения для маркетинга"
              />
              <span className="field-hint">
                Расскажите, что хотите найти для каждой строки. Также скажите, для чего хотите подобрать картинки.
              </span>
            </label>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Обработка...' : 'Запустить'}
            </button>
            {result && (
              <a className="ghost" href={result.url} download={result.name}>
                Скачать результат
              </a>
            )}
            {status === 'loading' && progress && progress.total > 0 ? (
              <div className="progress">
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="progress-text">
                  {progress.done} / {progress.total}
                </span>
              </div>
            ) : null}
            <div className="status">
              {status === 'success' && result ? (
                <span>
                  Готово: {result.name} · {formatBytes(result.size)}
                </span>
              ) : null}
              {status === 'error' && error ? <span className="error">{error}</span> : null}
            </div>
          </div>
        </form>

        <section className="tips">
          <div>
            <h3>Подсказки</h3>
            <ul>
              <li>Модель сама выберет до 3 inputs и до 3 tasks по названию колонок.</li>
              <li>Если картинки не нужны, явно укажите это в запросе.</li>
              <li>Результат вернется как файл с суффиксом _filled.</li>
            </ul>
          </div>
          <div className="tips-card">
            <p className="tips-title">Пример запроса</p>
            <code>Найди отрасль и описание компании, добавь 2 изображения для презентации</code>
          </div>
        </section>
      </main>
    </div>
  );
}
