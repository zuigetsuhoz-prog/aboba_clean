import { useState, useEffect } from 'react';
import { db, type WordList } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { WordListDetail } from './WordListDetail';
import { Modal } from '../components/Modal';
import type { AISettings } from '../types';

interface Props {
  aiSettings: AISettings;
  onOpenSettings: () => void;
}

export function ListsScreen({ aiSettings, onOpenSettings }: Props) {
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedList, setSelectedList] = useState<WordList | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<WordList | null>(null);

  const lists = useLiveQuery(() => db.wordLists.orderBy('createdAt').reverse().toArray(), []);
  const [wordCounts, setWordCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    if (!lists) return;
    Promise.all(
      lists.map(l => db.words.where('listId').equals(l.id!).count().then(c => [l.id!, c] as [number, number]))
    ).then(entries => setWordCounts(Object.fromEntries(entries)));
  }, [lists]);

  const createList = async () => {
    if (!newName.trim()) return;
    await db.wordLists.add({ name: newName.trim(), description: newDesc.trim(), createdAt: Date.now() });
    setNewName('');
    setNewDesc('');
    setShowCreate(false);
  };

  const deleteList = async (list: WordList) => {
    await db.words.where('listId').equals(list.id!).delete();
    await db.wordLists.delete(list.id!);
    setDeleteConfirm(null);
  };

  if (view === 'detail' && selectedList) {
    return (
      <WordListDetail
        list={selectedList}
        onBack={() => { setView('list'); setSelectedList(null); }}
        aiSettings={aiSettings}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900
                         border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">📚 Word Lists</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600
                     text-white text-xl font-bold leading-none active:scale-90 transition-transform"
        >
          +
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-20">
        {!lists || lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-8">
            <p className="text-5xl mb-3">📝</p>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No word lists yet</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Tap + to create your first list
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {lists.map(list => (
              <li
                key={list.id}
                className="flex items-center px-4 py-3 bg-white dark:bg-gray-900 active:bg-gray-50
                           dark:active:bg-gray-800 cursor-pointer"
                onClick={() => { setSelectedList(list); setView('detail'); }}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{list.name}</p>
                  {list.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{list.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className="text-sm text-gray-400 dark:text-gray-500">
                    {wordCounts[list.id!] ?? 0} words
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirm(list); }}
                    className="w-7 h-7 flex items-center justify-center rounded-full
                               text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    🗑
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">›</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showCreate && (
        <Modal title="New Word List" onClose={() => setShowCreate(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                List Name *
              </label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createList()}
                placeholder="e.g. HSK 1"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description (optional)
              </label>
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="e.g. Basic vocabulary"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={createList}
              disabled={!newName.trim()}
              className="w-full py-3 bg-indigo-600 disabled:opacity-50 text-white rounded-xl
                         font-semibold active:scale-95 transition-transform"
            >
              Create List
            </button>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal title="Delete List?" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Delete <strong>"{deleteConfirm.name}"</strong> and all its words? This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl
                           font-medium text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteList(deleteConfirm)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
