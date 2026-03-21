import { useState, useDeferredValue } from 'react';
import { db, type Word, type WordList } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { AIModal } from '../components/AIModal';
import { playGoogleTTS } from '../utils/googleTTS';
import { useT } from '../i18n';
import type { Lang } from '../types';
import type { AISettings } from '../types';

interface Props {
  lang: Lang;
  aiSettings: AISettings;
  onOpenSettings: () => void;
}

interface SearchResult {
  word: Word;
  lists: WordList[];
}

export function SearchScreen({ lang, aiSettings, onOpenSettings }: Props) {
  const t = useT(lang);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [aiWord, setAiWord] = useState<Word | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  const results = useLiveQuery<SearchResult[]>(async () => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return [];

    const allWords = await db.words.toArray();
    const matched = allWords.filter(w =>
      w.hanzi.includes(q) ||
      w.pinyin.toLowerCase().includes(q) ||
      w.translation.toLowerCase().includes(q),
    );

    const enriched = await Promise.all(
      matched.map(async word => {
        const refs = await db.wordRefs.where('wordId').equals(word.id!).toArray();
        const listIds = refs.map(r => r.listId);
        const lists = (await db.wordLists.bulkGet(listIds)).filter((l): l is WordList => !!l);
        return { word, lists };
      }),
    );

    return enriched;
  }, [deferredQuery]);

  const confidenceColor = (v: number) =>
    v <= 30 ? 'text-red-500' : v <= 60 ? 'text-orange-500' : 'text-green-600';

  return (
    <div className="flex flex-col">
      <header className="px-4 pt-3 pb-2 bg-white dark:bg-gray-900
                         border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t.searchTitle}</h1>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm
                     text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </header>

      <div className="pb-6">
        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-8">
            <p className="text-4xl mb-2">🔍</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">{t.searchHint}</p>
          </div>
        ) : !results || results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-8">
            <p className="text-4xl mb-2">😶</p>
            <p className="text-gray-500 dark:text-gray-400 font-medium">{t.noResults}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {results.map(({ word, lists }) => (
              <li key={word.id} className="px-4 py-3 bg-white dark:bg-gray-900">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-2xl font-medium text-gray-900 dark:text-white">
                        {word.hanzi}
                      </span>
                      <span className="text-sm text-indigo-600 dark:text-indigo-400">{word.pinyin}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{word.translation}</p>
                    {word.notes && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic truncate">
                        📝 {word.notes}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <ConfidenceBar value={word.confidence} className="max-w-[60px]" />
                      <span className={`text-xs font-medium ${confidenceColor(word.confidence)}`}>
                        {word.confidence}%
                      </span>
                    </div>
                    {lists.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <span className="text-xs text-gray-400 dark:text-gray-500">{t.inLists}</span>
                        {lists.map(l => (
                          <span
                            key={l.id}
                            className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40
                                       text-indigo-700 dark:text-indigo-300 rounded text-xs"
                          >
                            {l.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      disabled={playingId === word.id}
                      onClick={async () => {
                        setPlayingId(word.id!);
                        await playGoogleTTS(word.hanzi);
                        setPlayingId(null);
                      }}
                      className={`w-8 h-8 flex items-center justify-center rounded-full
                                 transition-opacity
                                 ${playingId === word.id
                                   ? 'opacity-40'
                                   : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    >
                      {playingId === word.id ? '⏳' : '🔊'}
                    </button>
                    {aiSettings.enabled && (
                      <button
                        onClick={() => setAiWord(word)}
                        className="w-8 h-8 flex items-center justify-center rounded-full
                                   text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        ✨
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {aiWord && (
        <AIModal
          hanzi={aiWord.hanzi}
          settings={aiSettings}
          onClose={() => setAiWord(null)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}
