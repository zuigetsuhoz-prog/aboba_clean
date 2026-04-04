import { useState, useRef, useCallback } from 'react';
import { db, getWordsForList } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { playTTS } from '../utils/tts';
import { useT } from '../i18n';
import { useAuth } from '../contexts/AuthContext';
import type { AppSettings, AISettings, Lang } from '../types';

interface Props {
  settings: AppSettings;
  onUpdateSettings: (updates: Partial<AppSettings>) => void;
  onShowAuth: () => void;
}

interface SingleListJSON {
  listName: string;
  words: Array<{
    hanzi: string; pinyin: string; translation: string; confidence?: number; reviewCount?: number; notes?: string;
  }>;
}

interface AllListsJSON {
  exportedAt: string;
  lists: SingleListJSON[];
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none
                  ${on ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      role="switch"
      aria-checked={on}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow
                        transition-transform duration-200 ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

export function SettingsScreen({ settings, onUpdateSettings, onShowAuth }: Props) {
  const lang: Lang = settings.language ?? 'en';
  const t = useT(lang);
  const { user, syncStatus, syncProgress, lastSyncedAt, pushToCloud, pullFromCloud, signOut } = useAuth();
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [audioTesting, setAudioTesting] = useState(false);
  const [audioTestResult, setAudioTestResult] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [exportListId, setExportListId] = useState<number | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lists = useLiveQuery(() => db.wordLists.orderBy('name').toArray(), []);
  const [dailyGoal, setDailyGoalState] = useState<number>(() => {
    const stored = localStorage.getItem('dailyGoal');
    return stored ? Math.max(1, parseInt(stored, 10)) || 50 : 50;
  });

  const updateAI = (updates: Partial<AISettings>) => {
    onUpdateSettings({ ai: { ...settings.ai, ...updates } });
  };

  const handleDailyGoalChange = useCallback((val: number) => {
    const clamped = Math.max(1, val);
    setDailyGoalState(clamped);
    localStorage.setItem('dailyGoal', String(clamped));
  }, []);

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(lang === 'ru' ? 'Импорт...' : 'Importing...');
    try {
      const text = await file.text();
      const raw = JSON.parse(text);

      // Support both single-list and all-lists export formats
      const toLists = (data: unknown): SingleListJSON[] => {
        if (typeof data !== 'object' || data === null) throw new Error('Invalid JSON');
        const d = data as Record<string, unknown>;
        if (Array.isArray(d.lists)) return d.lists as SingleListJSON[];
        if (typeof d.listName === 'string') return [d as unknown as SingleListJSON];
        throw new Error('Invalid format');
      };

      const importLists = toLists(raw);
      let totalWords = 0;

      const importTimestamp = Date.now();
      for (const item of importLists) {
        if (!item.listName || !Array.isArray(item.words)) continue;
        const listId = (await db.wordLists.add({ name: item.listName, createdAt: importTimestamp })) as number;
        for (let i = 0; i < item.words.length; i++) {
          const w = item.words[i];
          const wordId = (await db.words.add({
            hanzi: w.hanzi,
            pinyin: w.pinyin,
            translation: w.translation,
            confidence: typeof w.confidence === 'number' ? w.confidence : 50,
            reviewCount: typeof w.reviewCount === 'number' ? w.reviewCount : 0,
            notes: w.notes || undefined,
            createdAt: importTimestamp + i,
            sortOrder: i,
          })) as number;
          await db.wordRefs.add({ listId, wordId });
          totalWords++;
        }
      }

      setImportStatus(`✓ ${importLists.length} list(s), ${totalWords} words`);
    } catch (err) {
      setImportStatus(`✗ ${err instanceof Error ? err.message : 'Error'}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setTimeout(() => setImportStatus(''), 5000);
  };

  // ── Export single list ────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!exportListId) return;
    const list = await db.wordLists.get(exportListId as number);
    if (!list) return;
    const words = await getWordsForList(exportListId as number);
    const data: SingleListJSON = {
      listName: list.name,
      words: words.map(w => ({
        hanzi: w.hanzi, pinyin: w.pinyin, translation: w.translation,
        confidence: w.confidence, reviewCount: w.reviewCount, notes: w.notes,
      })),
    };
    downloadJSON(data, `${list.name.replace(/\s+/g, '_')}.json`);
  };

  // ── Export all lists ──────────────────────────────────────────────────────
  const handleExportAll = async () => {
    const allLists = await db.wordLists.orderBy('name').toArray();
    const exportLists: SingleListJSON[] = [];
    for (const list of allLists) {
      const words = await getWordsForList(list.id!);
      exportLists.push({
        listName: list.name,
        words: words.map(w => ({
          hanzi: w.hanzi, pinyin: w.pinyin, translation: w.translation,
          confidence: w.confidence, reviewCount: w.reviewCount, notes: w.notes,
        })),
      });
    }
    const data: AllListsJSON = { exportedAt: new Date().toISOString(), lists: exportLists };
    downloadJSON(data, `hanzi_all_lists_${new Date().toISOString().slice(0,10)}.json`);
  };

  const downloadJSON = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col">
      <header className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700
                         sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t.settingsTitle}</h1>
      </header>

      <div className="pb-6">
        <div className="py-4 space-y-6 xl:space-y-0 xl:grid xl:grid-cols-2 xl:gap-6 xl:p-6 xl:items-start">

        {/* Appearance */}
        <section className="px-4 xl:px-0">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {t.appearance}
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-gray-900 dark:text-white font-medium">{t.darkMode}</span>
              <Toggle on={settings.darkMode} onToggle={() => onUpdateSettings({ darkMode: !settings.darkMode })} />
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-gray-900 dark:text-white font-medium">{t.language}</span>
              <div className="flex gap-1">
                {(['en', 'ru'] as Lang[]).map(l => (
                  <button
                    key={l}
                    onClick={() => onUpdateSettings({ language: l })}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors
                                ${settings.language === l
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                  >
                    {l === 'en' ? '🇬🇧 EN' : '🇷🇺 RU'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Study / Daily Goal */}
        <section className="px-4 xl:px-0">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {t.dailyGoalSetting}
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-900 dark:text-white font-medium">{t.dailyGoalSetting}</span>
              <input
                type="number"
                min={1}
                value={dailyGoal}
                onChange={e => handleDailyGoalChange(parseInt(e.target.value, 10) || 1)}
                className="w-24 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-right
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </section>

        {/* Audio */}
        <section className="px-4 xl:px-0">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {t.audioSection}
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Google Translate TTS</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">{t.audioWorking}</p>
                {audioTestResult && (
                  <p className={`text-xs mt-1 ${audioTestResult === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-orange-500'}`}>
                    {audioTestResult === 'ok' ? '✓ Playing!' : '✗ ' + audioTestResult}
                  </p>
                )}
              </div>
              <button
                disabled={audioTesting}
                onClick={() => {
                  setAudioTesting(true);
                  setAudioTestResult('');
                  playTTS('你好');
                  setAudioTesting(false);
                  setAudioTestResult('ok');
                  setTimeout(() => setAudioTestResult(''), 4000);
                }}
                className="px-4 py-2 bg-indigo-600 disabled:opacity-50 text-white rounded-lg
                           text-sm font-medium active:scale-95 transition-transform"
              >
                {audioTesting ? '⏳' : t.audioTest}
              </button>
            </div>
          </div>
        </section>

        {/* AI Settings */}
        <section className="px-4 xl:px-0 xl:col-span-2">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {t.aiIntegration}
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-gray-900 dark:text-white font-medium">{t.enableAI}</span>
              <Toggle on={settings.ai.enabled} onToggle={() => updateAI({ enabled: !settings.ai.enabled })} />
            </div>
            <div className="px-4 py-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t.provider}
              </label>
              <select value={settings.ai.provider}
                onChange={e => updateAI({ provider: e.target.value as AISettings['provider'] })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="custom">Custom Endpoint</option>
              </select>
            </div>
            <div className="px-4 py-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t.apiKey}
              </label>
              <input type="password" value={settings.ai.apiKey}
                onChange={e => updateAI({ apiKey: e.target.value })} placeholder="sk-..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="px-4 py-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t.model}
              </label>
              <input type="text" value={settings.ai.model}
                onChange={e => updateAI({ model: e.target.value })}
                placeholder={settings.ai.provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini'}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            {settings.ai.provider === 'custom' && (
              <div className="px-4 py-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t.customEndpoint}
                </label>
                <input type="url" value={settings.ai.endpoint || ''}
                  onChange={e => updateAI({ endpoint: e.target.value })} placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
          </div>
        </section>

        {/* Import / Export */}
        <section className="px-4 xl:px-0 xl:col-span-2">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {t.importExport}
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
            {/* Import */}
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t.importJson}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t.importHint}</p>
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600
                           rounded-xl text-sm text-gray-600 dark:text-gray-400 font-medium
                           active:bg-gray-50 dark:active:bg-gray-700 transition-colors">
                {t.chooseFile}
              </button>
              {importStatus && (
                <p className={`mt-2 text-sm ${
                  importStatus.startsWith('✓') ? 'text-green-600 dark:text-green-400'
                  : importStatus.startsWith('✗') ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400'}`}>
                  {importStatus}
                </p>
              )}
            </div>

            {/* Export single */}
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{t.exportJson}</p>
              <div className="space-y-2">
                <select value={exportListId}
                  onChange={e => setExportListId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">{t.selectList}</option>
                  {lists?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <button onClick={handleExport} disabled={!exportListId}
                  className="w-full py-2.5 bg-indigo-600 disabled:opacity-40 text-white rounded-xl
                             text-sm font-medium active:scale-95 transition-transform">
                  {t.downloadJson}
                </button>
              </div>
            </div>

            {/* Export all */}
            <div className="px-4 py-3">
              <button
                onClick={handleExportAll}
                disabled={!lists || lists.length === 0}
                className="w-full py-2.5 bg-indigo-50 dark:bg-indigo-900/20 disabled:opacity-40
                           text-indigo-700 dark:text-indigo-300 rounded-xl text-sm font-medium
                           border border-indigo-200 dark:border-indigo-800
                           active:scale-95 transition-transform"
              >
                {t.exportAll}
              </button>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="px-4 xl:px-0 xl:col-span-2">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {t.accountSection}
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl divide-y divide-gray-100 dark:divide-gray-700">
            {user ? (
              <>
                {/* Email */}
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{t.signedInAs}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white break-all">{user.email}</p>
                </div>

                {/* Last sync time */}
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{t.syncSection}</p>
                  <p className={`text-sm font-medium ${
                    syncStatus === 'syncing' ? 'text-indigo-500 dark:text-indigo-400' :
                    syncStatus === 'error'   ? 'text-red-500' :
                    syncStatus === 'offline' ? 'text-orange-500' :
                    lastSyncedAt             ? 'text-green-600 dark:text-green-400' :
                    'text-gray-400'
                  }`}>
                    {syncStatus === 'syncing'
                      ? syncProgress && syncProgress.loaded > 0
                        ? syncProgress.total > 0
                          ? `${t.syncSyncing} ${syncProgress.loaded}/${syncProgress.total} words`
                          : `${t.syncSyncing} ${syncProgress.loaded} words`
                        : t.syncSyncing
                      : syncStatus === 'error'   ? t.syncError
                      : syncStatus === 'offline' ? t.syncOffline
                      : lastSyncedAt
                        ? `${t.lastSynced} ${new Date(lastSyncedAt).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' at')}`
                        : t.neverSynced}
                  </p>
                </div>

                {/* Push to cloud */}
                <div className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">{t.pushToCloud}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t.pushToCloudHint}</p>
                  <button
                    onClick={async () => {
                      if (!window.confirm(t.syncConfirmPush)) return;
                      setPushing(true);
                      await pushToCloud();
                      setPushing(false);
                    }}
                    disabled={pushing || pulling || syncStatus === 'syncing'}
                    className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400
                               text-sm rounded-lg disabled:opacity-40 active:scale-95 transition-transform"
                  >
                    {pushing ? t.syncSyncing : '↑ ' + t.pushToCloud}
                  </button>
                </div>

                {/* Pull from cloud */}
                <div className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-0.5">{t.pullFromCloud}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t.pullFromCloudHint}</p>
                  <button
                    onClick={async () => {
                      if (!window.confirm(t.syncConfirmPull)) return;
                      setPulling(true);
                      await pullFromCloud();
                      setPulling(false);
                    }}
                    disabled={pushing || pulling || syncStatus === 'syncing'}
                    className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400
                               text-sm rounded-lg disabled:opacity-40 active:scale-95 transition-transform"
                  >
                    {pulling ? t.syncSyncing : '↓ ' + t.pullFromCloud}
                  </button>
                </div>

                {/* Sign out */}
                <div className="px-4 py-3">
                  <button onClick={signOut} className="text-sm text-red-600 dark:text-red-400 font-medium">
                    {t.signOut}
                  </button>
                </div>
              </>
            ) : (
              <div className="px-4 py-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t.signInToSync}</p>
                <button
                  onClick={onShowAuth}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium
                             active:scale-95 transition-transform"
                >
                  {t.signInOrSignUp}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* About */}
        <section className="px-4 xl:px-0 xl:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl px-4 py-3 text-center">
            <p className="text-xl font-semibold text-gray-900 dark:text-white mb-1">BALBES files</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{t.about}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Version: {__APP_VERSION__} ({__GIT_HASH__})
            </p>
          </div>
        </section>
        </div>{/* end xl grid */}
      </div>
    </div>
  );
}
