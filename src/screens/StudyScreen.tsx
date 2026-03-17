import { useState } from 'react';
import { db, type Word } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { FlashcardScreen } from './FlashcardScreen';
import type { AISettings } from '../types';

interface Props {
  aiSettings: AISettings;
  onOpenSettings: () => void;
}

export function StudyScreen({ aiSettings, onOpenSettings }: Props) {
  const [selectedLists, setSelectedLists] = useState<Set<number>>(new Set());
  const [limitN, setLimitN] = useState('');
  const [pinyinFilter, setPinyinFilter] = useState('');
  const [maxConfidence, setMaxConfidence] = useState('');
  const [shuffle, setShuffle] = useState(false);
  const [session, setSession] = useState<Word[] | null>(null);

  const lists = useLiveQuery(() => db.wordLists.orderBy('name').toArray(), []);
  const allWords = useLiveQuery<Word[]>(
    () => selectedLists.size > 0
      ? db.words.where('listId').anyOf([...selectedLists]).sortBy('confidence')
      : Promise.resolve([] as Word[]),
    [selectedLists]
  );

  const toggleList = (id: number) => {
    setSelectedLists(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredPreview = (() => {
    if (!allWords) return [];
    let words = [...allWords];

    if (pinyinFilter.trim()) {
      const f = pinyinFilter.trim().toLowerCase();
      words = words.filter(w => w.pinyin.toLowerCase().startsWith(f));
    }

    if (maxConfidence.trim()) {
      const max = parseInt(maxConfidence);
      if (!isNaN(max)) words = words.filter(w => w.confidence <= max);
    }

    if (limitN.trim()) {
      const n = parseInt(limitN);
      if (!isNaN(n) && n > 0) words = words.slice(0, n);
    }

    if (shuffle) {
      words = [...words].sort(() => Math.random() - 0.5);
    }

    return words;
  })();

  const startSession = () => {
    if (filteredPreview.length === 0) return;
    setSession(filteredPreview);
  };

  if (session) {
    return (
      <FlashcardScreen
        words={session}
        onExit={() => setSession(null)}
        aiSettings={aiSettings}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700
                         sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">🎴 New Study Session</h1>
      </header>

      <div className="flex-1 overflow-y-auto pb-32">
        {/* Source lists */}
        <section className="mt-4 px-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Source Lists
          </h2>
          {!lists || lists.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              No word lists. Go to Lists tab to create one.
            </p>
          ) : (
            <div className="space-y-1">
              {lists.map(l => (
                <label
                  key={l.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-white dark:bg-gray-800
                             rounded-xl cursor-pointer active:bg-gray-50 dark:active:bg-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedLists.has(l.id!)}
                    onChange={() => toggleList(l.id!)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                  <span className="text-gray-900 dark:text-white font-medium">{l.name}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Filters */}
        <section className="mt-5 px-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Filters
          </h2>
          <div className="space-y-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-300 w-32 shrink-0">
                  First N words
                </label>
                <input
                  type="number"
                  min="1"
                  value={limitN}
                  onChange={e => setLimitN(e.target.value)}
                  placeholder="All"
                  className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-300 w-32 shrink-0">
                  Pinyin starts with
                </label>
                <input
                  type="text"
                  value={pinyinFilter}
                  onChange={e => setPinyinFilter(e.target.value)}
                  placeholder="e.g. zh, n"
                  className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-300 w-32 shrink-0">
                  Max confidence
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={maxConfidence}
                  onChange={e => setMaxConfidence(e.target.value)}
                  placeholder="100"
                  className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700 dark:text-gray-300 w-32 shrink-0">
                  Random shuffle
                </label>
                <button
                  onClick={() => setShuffle(s => !s)}
                  className={`relative w-10 h-6 rounded-full transition-colors ${
                    shuffle ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow
                                    transition-transform ${shuffle ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Preview count */}
        {selectedLists.size > 0 && (
          <div className="mt-4 px-4">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200
                            dark:border-indigo-800 rounded-xl p-3 text-center">
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {filteredPreview.length}
              </span>
              <span className="text-sm text-indigo-600 dark:text-indigo-400 ml-1">words selected</span>
            </div>
          </div>
        )}
      </div>

      {/* Start button */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 py-3
                      bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={startSession}
          disabled={filteredPreview.length === 0}
          className="w-full py-3.5 bg-indigo-600 disabled:opacity-40 text-white rounded-2xl
                     font-semibold text-base active:scale-95 transition-transform"
        >
          Start Session →
        </button>
      </div>
    </div>
  );
}
