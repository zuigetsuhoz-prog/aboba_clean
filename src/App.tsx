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
    <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                      transition-colors
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
    <div className="flex flex-col items-center justify-center h-full text-center px-6 select-none">
      <p className="text-5xl mb-4 opacity-10">📋</p>
      <p className="text-sm text-gray-300 dark:text-gray-700 leading-relaxed">
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

  // Stable setter so screens can include it in useEffect deps without infinite loops
  const setPanel = useCallback((node: ReactNode) => setPanelContent(node), []);

  const handleOpenSettings = () => setActiveTab('settings');

  return (
    <div className={settings.darkMode ? 'dark' : ''}>
      <div
        className="flex h-svh overflow-hidden"
        style={{ background: settings.darkMode ? '#111827' : '#f3f4f6' }}
      >
        {/* ── Left sidebar — lg+ only ───────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-[280px] xl:w-[260px] shrink-0
                          bg-white dark:bg-gray-900
                          border-r border-gray-200 dark:border-gray-700">
          <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-800">
            <p className="text-base font-bold text-gray-900 dark:text-white">BALBES files</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Offline-first</p>
          </div>
          <SidebarNav active={activeTab} onSelect={setActiveTab} lang={lang} />
        </aside>

        {/* ── Main column ───────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Screen area — fills all space above the tab bar */}
          <PanelCtx.Provider value={setPanel}>
            <div className="flex-1 overflow-hidden">
              {activeTab === 'lists' && (
                <ListsScreen
                  aiSettings={settings.ai}
                  lang={lang}
                  onOpenSettings={handleOpenSettings}
                />
              )}
              {activeTab === 'study' && (
                <StudyScreen
                  aiSettings={settings.ai}
                  lang={lang}
                  onOpenSettings={handleOpenSettings}
                />
              )}
              {activeTab === 'search' && (
                <SearchScreen
                  lang={lang}
                  aiSettings={settings.ai}
                  onOpenSettings={handleOpenSettings}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsScreen
                  settings={settings}
                  onUpdateSettings={updateSettings}
                />
              )}
            </div>
          </PanelCtx.Provider>

          {/* Bottom tab bar — mobile / sm only (hidden lg+) */}
          <TabBar active={activeTab} onSelect={setActiveTab} lang={lang} />
        </div>

        {/* ── Right context panel — xl+ only ───────────────────────────────── */}
        <aside className="hidden xl:flex flex-col w-[300px] shrink-0
                          bg-white dark:bg-gray-900
                          border-l border-gray-200 dark:border-gray-700">
          {panelContent ?? <PanelPlaceholder />}
        </aside>
      </div>
    </div>
  );
}
