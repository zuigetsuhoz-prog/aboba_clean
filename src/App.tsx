import { useState } from 'react';
import { TabBar } from './components/TabBar';
import { ListsScreen } from './screens/ListsScreen';
import { StudyScreen } from './screens/StudyScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useSettings } from './hooks/useSettings';
import type { Tab } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('lists');
  const { settings, updateSettings } = useSettings();

  const handleOpenSettings = () => setActiveTab('settings');

  return (
    <div className={settings.darkMode ? 'dark' : ''} style={{ minHeight: '100svh' }}>
      <div style={{ minHeight: '100svh', background: settings.darkMode ? '#111827' : '#f3f4f6' }}>
        {activeTab === 'lists' && (
          <ListsScreen
            aiSettings={settings.ai}
            onOpenSettings={handleOpenSettings}
          />
        )}
        {activeTab === 'study' && (
          <StudyScreen
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
        <TabBar active={activeTab} onSelect={setActiveTab} />
      </div>
    </div>
  );
}
