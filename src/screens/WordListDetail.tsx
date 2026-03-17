import { useState } from 'react';
import { db, type WordList, type Word } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { Modal } from '../components/Modal';
import { AIModal } from '../components/AIModal';
import { useTTS } from '../hooks/useTTS';
import type { AISettings } from '../types';

interface Props {
  list: WordList;
  onBack: () => void;
  aiSettings?: AISettings;
  onOpenSettings?: () => void;
}

const defaultAI: AISettings = { provider: 'openai', apiKey: '', model: 'gpt-4o-mini' };

export function WordListDetail({ list, onBack, aiSettings = defaultAI, onOpenSettings = () => {} }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [hanzi, setHanzi] = useState('');
  const [pinyin, setPinyin] = useState('');
  const [translation, setTranslation] = useState('');
  const [deleteWord, setDeleteWord] = useState<Word | null>(null);
  const [aiWord, setAiWord] = useState<Word | null>(null);

  const { speak, supported: ttsSupported } = useTTS();

  const words = useLiveQuery(
    () => db.words.where('listId').equals(list.id!).sortBy('confidence'),
    [list.id]
  );

  const addWord = async () => {
    if (!hanzi.trim() || !pinyin.trim() || !translation.trim()) return;
    await db.words.add({
      listId: list.id!,
      hanzi: hanzi.trim(),
      pinyin: pinyin.trim(),
      translation: translation.trim(),
      confidence: 50,
      reviewCount: 0,
    });
    setHanzi('');
    setPinyin('');
    setTranslation('');
    setShowAdd(false);
  };

  const doDeleteWord = async (word: Word) => {
    await db.words.delete(word.id!);
    setDeleteWord(null);
  };

  const confidenceColor = (v: number) =>
    v <= 30 ? 'text-red-500' : v <= 60 ? 'text-orange-500' : 'text-green-600';

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-900
                         border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full
                     text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800
                     transition-colors text-lg"
        >
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">{list.name}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">{words?.length ?? 0} words</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600
                     text-white text-xl font-bold leading-none active:scale-90 transition-transform"
        >
          +
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-20">
        {!words || words.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-8">
            <p className="text-5xl mb-3">🈳</p>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No words yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Tap + to add your first word</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {words.map(word => (
              <li key={word.id} className="px-4 py-3 bg-white dark:bg-gray-900">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-medium text-gray-900 dark:text-white">
                        {word.hanzi}
                      </span>
                      <span className="text-sm text-indigo-600 dark:text-indigo-400">{word.pinyin}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{word.translation}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <ConfidenceBar value={word.confidence} className="max-w-[80px]" />
                      <span className={`text-xs font-medium ${confidenceColor(word.confidence)}`}>
                        {word.confidence}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {ttsSupported && (
                      <button
                        onClick={() => speak(word.hanzi)}
                        className="w-8 h-8 flex items-center justify-center rounded-full
                                   text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        🔊
                      </button>
                    )}
                    <button
                      onClick={() => setAiWord(word)}
                      className="w-8 h-8 flex items-center justify-center rounded-full
                                 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      ✨
                    </button>
                    <button
                      onClick={() => setDeleteWord(word)}
                      className="w-8 h-8 flex items-center justify-center rounded-full
                                 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Word" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            {[
              { label: '汉字 Hanzi *', value: hanzi, set: setHanzi, ph: '你好' },
              { label: 'Pīnyīn *', value: pinyin, set: setPinyin, ph: 'nǐ hǎo' },
              { label: 'Translation *', value: translation, set: setTranslation, ph: 'hello' },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {f.label}
                </label>
                <input
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.ph}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
            <button
              onClick={addWord}
              disabled={!hanzi.trim() || !pinyin.trim() || !translation.trim()}
              className="w-full py-3 bg-indigo-600 disabled:opacity-50 text-white rounded-xl
                         font-semibold active:scale-95 transition-transform"
            >
              Add Word
            </button>
          </div>
        </Modal>
      )}

      {deleteWord && (
        <Modal title="Delete Word?" onClose={() => setDeleteWord(null)}>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Delete <strong>{deleteWord.hanzi}</strong> ({deleteWord.translation})?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteWord(null)}
                className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl
                           font-medium text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => doDeleteWord(deleteWord)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

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
