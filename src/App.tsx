import { useState, useCallback, type ReactNode } from 'react';
import { TabBar } from './components/TabBar';
import { ListsScreen } from './screens/ListsScreen';
import { StudyScreen } from './screens/StudyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SearchScreen } from './screens/SearchScreen';
import { useSettings } from './hooks/useSettings';
import { PanelCtx } from './contexts/PanelContext';
import { useT } from './i18n';
import type { Tab } from './types';

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

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('lists');
  const { settings, updateSettings } = useSettings();
  const [panelContent, setPanelContent] = useState<ReactNode>(null);

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
      {activeTab === 'settings' && (
        <SettingsScreen settings={settings} onUpdateSettings={updateSettings} />
      )}
    </>
  );

  return (
    <div
      className={settings.darkMode ? 'dark' : ''}
      style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100dvh', overflow: 'hidden', background: bg }}
    >
      {/* ── MOBILE layout (< 1024px) ── */}
      <div
        className="lg:hidden"
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        {/* Mobile content area — the scroll container */}
        <PanelCtx.Provider value={setPanel}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {screen}
          </div>
        </PanelCtx.Provider>
        {/* Mobile bottom tab bar */}
        <TabBar active={activeTab} onSelect={setActiveTab} lang={lang} />
      </div>

      {/* ── DESKTOP layout (>= 1024px) ── */}
      <div
        className="hidden lg:flex"
        style={{ flex: 1, minHeight: 0, overflow: 'hidden', height: '100dvh' }}
      >
        {/* Left sidebar */}
        <aside
          className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700"
          style={{ flexShrink: 0, width: '260px', display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
        >
          <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-800" style={{ flexShrink: 0 }}>
            <p className="text-base font-bold text-gray-900 dark:text-white">BALBES files</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Offline-first</p>
          </div>
          <SidebarNav active={activeTab} onSelect={setActiveTab} lang={lang} />
        </aside>

        {/* Center column */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Center scroll container */}
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
