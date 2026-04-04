import { useState, useCallback, type ReactNode } from 'react';
import { TabBar } from './components/TabBar';
import { ListsScreen } from './screens/ListsScreen';
import { StudyScreen } from './screens/StudyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SearchScreen } from './screens/SearchScreen';
import { StatisticsScreen } from './screens/StatisticsScreen';
import { AuthScreen } from './screens/AuthScreen';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useSettings } from './hooks/useSettings';
import { PanelCtx } from './contexts/PanelContext';
import { useT } from './i18n';
import type { Tab } from './types';
import type { SyncStatus } from './sync';

function SidebarNav({
  active,
  onSelect,
  lang,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
  lang: Parameters<typeof useT>[0];
}) {
  const t = useT(lang);
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'lists',    label: t.tabLists,    icon: '📚' },
    { id: 'study',    label: t.tabStudy,    icon: '🎴' },
    { id: 'search',   label: t.tabSearch,   icon: '🔍' },
    { id: 'stats',    label: t.tabStats,    icon: '📊' },
    { id: 'settings', label: t.tabSettings, icon: '⚙️' },
  ];
  return (
    <nav style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px 8px' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                      transition-colors mb-0.5
                      ${active === tab.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

function PanelPlaceholder() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '0 24px', userSelect: 'none' }}>
      <p style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.1 }}>📋</p>
      <p className="text-sm text-gray-300 dark:text-gray-700" style={{ lineHeight: 1.6 }}>
        Select a word or start a study session
      </p>
    </div>
  );
}

function SyncDot({ status, lastSyncedAt }: { status: SyncStatus; lastSyncedAt: number | null }) {
  if (status === 'syncing') return <span className="text-xs text-indigo-400 animate-pulse">⟳</span>;
  if (status === 'error')   return <span className="text-xs text-red-400">⚠</span>;
  if (status === 'offline') return <span className="text-xs text-orange-400">⊘</span>;
  if (lastSyncedAt) {
    const d = new Date(lastSyncedAt);
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return <span className="text-xs text-green-500">✓ {label}</span>;
  }
  return <span className="text-xs text-gray-400">Not synced</span>;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>('lists');
  const { settings, updateSettings } = useSettings();
  const [panelContent, setPanelContent] = useState<ReactNode>(null);
  const [showAuth, setShowAuth] = useState(false);

  const { user, syncStatus, lastSyncedAt } = useAuth();
  const t = useT(settings.language);

  const lang = settings.language;
  const setPanel = useCallback((node: ReactNode) => setPanelContent(node), []);
  const handleOpenSettings = () => setActiveTab('settings');

  const bg = settings.darkMode ? '#111827' : '#f3f4f6';

  const screen = (
    <>
      {activeTab === 'lists' && (
        <ListsScreen aiSettings={settings.ai} lang={lang} onOpenSettings={handleOpenSettings} />
      )}
      {activeTab === 'study' && (
        <StudyScreen aiSettings={settings.ai} lang={lang} onOpenSettings={handleOpenSettings} />
      )}
      {activeTab === 'search' && (
        <SearchScreen lang={lang} aiSettings={settings.ai} onOpenSettings={handleOpenSettings} />
      )}
      {activeTab === 'stats' && (
        <StatisticsScreen lang={lang} />
      )}
      {activeTab === 'settings' && (
        <SettingsScreen settings={settings} onUpdateSettings={updateSettings} onShowAuth={() => setShowAuth(true)} />
      )}
    </>
  );

  // Banner shown at top when user is not logged in
  const banner = !user ? (
    <div className="bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-200 dark:border-indigo-800
                    px-4 py-2 flex items-center justify-between shrink-0">
      <p className="text-xs text-indigo-700 dark:text-indigo-300">{t.signInBanner}</p>
      <button
        onClick={() => setShowAuth(true)}
        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 px-2 py-1
                   rounded hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors"
      >
        {t.signIn}
      </button>
    </div>
  ) : null;

  return (
    <div
      className={settings.darkMode ? 'dark' : ''}
      style={{ width: '100vw', height: '100dvh', overflow: 'hidden', background: bg }}
    >
      {/* Auth modal */}
      {showAuth && <AuthScreen onClose={() => setShowAuth(false)} lang={lang} />}

      {/* ── MOBILE layout (< 1024px) ──────────────────────────────────────── */}
      <div className="flex flex-col h-dvh overflow-hidden lg:hidden">
        {banner}
        <PanelCtx.Provider value={setPanel}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {screen}
          </div>
        </PanelCtx.Provider>
        <TabBar active={activeTab} onSelect={setActiveTab} lang={lang} />
      </div>

      {/* ── DESKTOP layout (>= 1024px) ────────────────────────────────────── */}
      <div className="hidden lg:flex h-dvh w-full overflow-hidden">
        {/* Left sidebar */}
        <aside
          className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col"
          style={{ flexShrink: 0, width: '260px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <p className="text-base font-bold text-gray-900 dark:text-white">BALBES files</p>
            <div className="flex items-center justify-between mt-0.5">
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {user ? user.email : 'Offline-first'}
              </p>
              {user && <SyncDot status={syncStatus} lastSyncedAt={lastSyncedAt} />}
            </div>
          </div>
          <SidebarNav active={activeTab} onSelect={setActiveTab} lang={lang} />
        </aside>

        {/* Center column */}
        <div className="flex flex-col overflow-hidden" style={{ flex: 1, minHeight: 0 }}>
          {banner}
          <PanelCtx.Provider value={setPanel}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {screen}
            </div>
          </PanelCtx.Provider>
        </div>

        {/* Right panel — xl+ only */}
        <aside
          className="hidden xl:flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700"
          style={{ flexShrink: 0, width: '300px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          {panelContent ?? <PanelPlaceholder />}
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
