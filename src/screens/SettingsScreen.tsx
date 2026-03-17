import { useState, useRef } from 'react';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTTS } from '../hooks/useTTS';
import type { AppSettings, AISettings } from '../types';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
}

interface ImportJSON {
  listName: string;
  words: Array<{
    hanzi: string;
    pinyin: string;
    translation: string;
    confidence?: number;
  }>;
}

export function SettingsScreen({ settings, onUpdateSettings }: Props) {
  const { speak, supported: ttsSupported } = useTTS();
  const [importStatus, setImportStatus] = useState('');
  const [exportListId, setExportListId] = useState<number | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lists = useLiveQuery(() => db.wordLists.orderBy('name').toArray(), []);

  const updateAI = (updates: Partial<AISettings>) => {
    onUpdateSettings({ ai: { ...settings.ai, ...updates } });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Importing...');
    try {
      const text = await file.text();
      const data: ImportJSON = JSON.parse(text);
      if (!data.listName || !Array.isArray(data.words)) {
        throw new Error('Invalid JSON format');
      }
      const listId = await db.wordLists.add({
        name: data.listName,
        createdAt: Date.now(),
      });
      const words = data.words.map(w => ({
        listId: listId as number,
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        translation: w.translation,
        confidence: typeof w.confidence === 'number' ? w.confidence : 50,
        reviewCount: 0,
      }));
      await db.words.bulkAdd(words);
      setImportStatus(`✓ Imported "${data.listName}" with ${words.length} words`);
    } catch (err) {
      setImportStatus(`✗ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setImportStatus(''), 4000);
  };

  const handleExport = async () => {
    const targetId = exportListId;
    if (!targetId) return;

    const list = await db.wordLists.get(targetId as number);
    if (!list) return;

    const words = await db.words.where('listId').equals(targetId as number).toArray();
    const data: ImportJSON = {
      listName: list.name,
      words: words.map(w => ({
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        translation: w.translation,
        confidence: w.confidence,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${list.name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700
                         sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">⚙️ Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto pb-24 space-y-6 py-4">
        {/* Appearance */}
        <section className="px-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Appearance
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-gray-900 dark:text-white font-medium">Dark Mode</span>
              <button
                onClick={() => onUpdateSettings({ darkMode: !settings.darkMode })}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  settings.darkMode ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow
                                  transition-transform ${settings.darkMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* TTS */}
        <section className="px-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Text-to-Speech
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3">
            {ttsSupported ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Web Speech API</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Available</p>
                </div>
                <button
                  onClick={() => speak('你好，欢迎学习中文！', 'zh-CN')}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium
                             active:scale-95 transition-transform"
                >
                  🔊 Test
                </button>
              </div>
            ) : (
              <p className="text-sm text-orange-500 dark:text-orange-400">
                Text-to-speech is not available in this browser.
              </p>
            )}
          </div>
        </section>

        {/* AI Settings */}
        <section className="px-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            AI Integration
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
            <div className="px-4 py-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Provider
              </label>
              <select
                value={settings.ai.provider}
                onChange={e => updateAI({ provider: e.target.value as AISettings['provider'] })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="custom">Custom Endpoint</option>
              </select>
            </div>

            <div className="px-4 py-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                API Key
              </label>
              <input
                type="password"
                value={settings.ai.apiKey}
                onChange={e => updateAI({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="px-4 py-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Model
              </label>
              <input
                type="text"
                value={settings.ai.model}
                onChange={e => updateAI({ model: e.target.value })}
                placeholder={settings.ai.provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {settings.ai.provider === 'custom' && (
              <div className="px-4 py-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Custom Endpoint URL
                </label>
                <input
                  type="url"
                  value={settings.ai.endpoint || ''}
                  onChange={e => updateAI({ endpoint: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}
          </div>
        </section>

        {/* Import / Export */}
        <section className="px-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Import / Export
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
            {/* Import */}
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Import JSON</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Import a word list from a JSON file. Expected format: {"{ listName, words[] }"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600
                           rounded-xl text-sm text-gray-600 dark:text-gray-400 font-medium
                           active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
              >
                📂 Choose JSON File
              </button>
              {importStatus && (
                <p className={`mt-2 text-sm ${
                  importStatus.startsWith('✓')
                    ? 'text-green-600 dark:text-green-400'
                    : importStatus.startsWith('✗')
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {importStatus}
                </p>
              )}
            </div>

            {/* Export */}
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Export JSON</p>
              <div className="space-y-2">
                <select
                  value={exportListId}
                  onChange={e => setExportListId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select a list...</option>
                  {lists?.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleExport}
                  disabled={!exportListId}
                  className="w-full py-2.5 bg-indigo-600 disabled:opacity-40 text-white rounded-xl
                             text-sm font-medium active:scale-95 transition-transform"
                >
                  ⬇ Download JSON
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section className="px-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3 text-center">
            <p className="text-2xl mb-1">汉字学习</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Chinese Learning PWA · Offline-first</p>
          </div>
        </section>
      </div>
    </div>
  );
}
