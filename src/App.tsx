import { useState } from 'react';
import { TabBar } from './components/TabBar';
import { ListsScreen } from './screens/ListsScreen';
import { StudyScreen } from './screens/StudyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SearchScreen } from './screens/SearchScreen';
import { useSettings } from './hooks/useSettings';
import type { Tab } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('lists');
  const { settings, updateSettings } = useSettings();

  const handleOpenSettings = () => setActiveTab('settings');

  return (
    <div className={settings.darkMode ? 'dark' : ''}>
      <div
        className="min-h-svh"
        style={{ background: settings.darkMode ? '#111827' : '#f3f4f6' }}
      >
        {activeTab === 'lists' && (
          <ListsScreen
            aiSettings={settings.ai}
            lang={settings.language}
            onOpenSettings={handleOpenSettings}
          />
        )}
        {activeTab === 'study' && (
          <StudyScreen
            aiSettings={settings.ai}
            lang={settings.language}
            onOpenSettings={handleOpenSettings}
          />
        )}
        {activeTab === 'search' && (
          <SearchScreen
            lang={settings.language}
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
        <TabBar active={activeTab} onSelect={setActiveTab} lang={settings.language} />
      </div>
    </div>
  );
}
