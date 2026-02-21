import { useState } from 'react';
import OverviewTab from './OverviewTab';
import SessionsTab from './SessionsTab';
import UploadsTab from './UploadsTab';
import ResultsTab from './ResultsTab';
import SurveysTab from './SurveysTab';

type Tab = 'overview' | 'sessions' | 'uploads' | 'results' | 'surveys';

type Props = { token: string; onLogout: () => void };

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Обзор', icon: '📊' },
  { id: 'sessions', label: 'Сессии', icon: '👥' },
  { id: 'uploads', label: 'Загрузки', icon: '📁' },
  { id: 'results', label: 'Результаты', icon: '✅' },
  { id: 'surveys', label: 'Опросы', icon: '💬' },
];

export default function Dashboard({ token, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-logo">Stroki</span>
          <span className="sidebar-badge">admin</span>
        </div>
        <nav className="sidebar-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-item${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="nav-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="logout-btn" onClick={onLogout}>
            <span className="nav-icon">🚪</span>
            Выйти
          </button>
        </div>
      </aside>

      <main className="admin-main">
        {tab === 'overview' && <OverviewTab token={token} />}
        {tab === 'sessions' && <SessionsTab token={token} />}
        {tab === 'uploads' && <UploadsTab token={token} />}
        {tab === 'results' && <ResultsTab token={token} />}
        {tab === 'surveys' && <SurveysTab token={token} />}
      </main>
    </div>
  );
}
