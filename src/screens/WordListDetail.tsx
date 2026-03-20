import { useState, useMemo } from 'react';
import {
  db, type WordList, type Word,
  getWordsForList, addWordToList, deleteWordFromList, copyWordToList,
} from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { Modal } from '../components/Modal';
import { AIModal } from '../components/AIModal';
import { useTTS } from '../hooks/useTTS';
import { useT } from '../i18n';
import type { AISettings, Lang, SortOption } from '../types';

const SORT_KEY = (listId: number) => `sort_${listId}`;
const loadSort = (listId: number): SortOption =>
  (localStorage.getItem(SORT_KEY(listId)) as SortOption | null) ?? 'default';
const saveSort = (listId: number, s: SortOption) =>
  localStorage.setItem(SORT_KEY(listId), s);

interface Props {
  list: WordList;
  lang: Lang;
  onBack: () => void;
  aiSettings: AISettings;
  onOpenSettings: () => void;
}

export function WordListDetail({ list, lang, onBack, aiSettings, onOpenSettings }: Props) {
  const t = useT(lang);

  // ── sort ──────────────────────────────────────────────────────────────────
  const [sortOpt, setSortOpt] = useState<SortOption>(() => loadSort(list.id!));
  const setSort = (s: SortOption) => { setSortOpt(s); saveSort(list.id!, s); };

  // ── add word form ──────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [hanzi, setHanzi] = useState('');
  const [pinyin, setPinyin] = useState('');
  const [translation, setTranslation] = useState('');
  const [noteInput, setNoteInput] = useState('');

  // ── modals ────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Word | null>(null);
  const [aiWord, setAiWord] = useState<Word | null>(null);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);

  // ── multi-select ──────────────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const { speak, supported: ttsSupported } = useTTS();

  const rawWords = useLiveQuery(() => getWordsForList(list.id!), [list.id]);

  const words = useMemo(() => {
    if (!rawWords) return [];
    const arr = [...rawWords];
    if (sortOpt === 'az') arr.sort((a, b) => a.pinyin.localeCompare(b.pinyin));
    else if (sortOpt === 'za') arr.sort((a, b) => b.pinyin.localeCompare(a.pinyin));
    else if (sortOpt === 'conf-asc') arr.sort((a, b) => a.confidence - b.confidence);
    else if (sortOpt === 'conf-desc') arr.sort((a, b) => b.confidence - a.confidence);
    else if (sortOpt === 'review-asc') arr.sort((a, b) => a.reviewCount - b.reviewCount);
    else if (sortOpt === 'review-desc') arr.sort((a, b) => b.reviewCount - a.reviewCount);
    return arr;
  }, [rawWords, sortOpt]);

  const addWord = async () => {
    if (!hanzi.trim() || !pinyin.trim() || !translation.trim()) return;
    await addWordToList(list.id!, {
      hanzi: hanzi.trim(), pinyin: pinyin.trim(), translation: translation.trim(),
      confidence: 50, reviewCount: 0,
      notes: noteInput.trim() || undefined,
    });
    setHanzi(''); setPinyin(''); setTranslation(''); setNoteInput('');
    setShowAdd(false);
  };

  const doDelete = async (word: Word) => {
    await deleteWordFromList(word.id!, list.id!);
    setDeleteTarget(null);
  };

  const saveNote = async (wordId: number, notes: string) => {
    await db.words.update(wordId, { notes: notes.trim() || undefined });
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => { setSelectMode(false); setSelected(new Set()); };

  const doResetConfidence = async () => {
    for (const wid of selected) {
      await db.words.update(wid, { confidence: 0 });
    }
    setShowResetConfirm(false);
    exitSelectMode();
  };

  const confidenceColor = (v: number) =>
    v <= 30 ? 'text-red-500' : v <= 60 ? 'text-orange-500' : 'text-green-600';

  const cycleAlpha = () => {
    setSort(sortOpt === 'az' ? 'za' : sortOpt === 'za' ? 'default' : 'az');
  };
  const cycleConf = () => {
    setSort(sortOpt === 'conf-asc' ? 'conf-desc' : sortOpt === 'conf-desc' ? 'default' : 'conf-asc');
  };
  const cycleReview = () => {
    setSort(sortOpt === 'review-asc' ? 'review-desc' : sortOpt === 'review-desc' ? 'default' : 'review-asc');
  };

  const alphaLabel = sortOpt === 'az' ? t.sortAZ : sortOpt === 'za' ? t.sortZA : t.sortAlpha;
  const confLabel  = sortOpt === 'conf-asc' ? t.sortConfAsc : sortOpt === 'conf-desc' ? t.sortConfDesc : t.sortConf;
  const revLabel   = sortOpt === 'review-asc' ? t.sortReviewAsc : sortOpt === 'review-desc' ? t.sortReviewDesc : t.sortReviews;

  const alphaActive  = sortOpt === 'az' || sortOpt === 'za';
  const confActive   = sortOpt === 'conf-asc' || sortOpt === 'conf-desc';
  const reviewActive = sortOpt === 'review-asc' || sortOpt === 'review-desc';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-900
                         border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <button
          onClick={selectMode ? exitSelectMode : onBack}
          className="w-9 h-9 flex items-center justify-center rounded-full
                     text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800
                     text-lg transition-colors"
        >
          ‹
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">{list.name}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {words.length} {t.words}
            {selectMode && selected.size > 0 && ` · ${selected.size} selected`}
          </p>
        </div>
        {selectMode ? (
          <div className="flex gap-1">
            <button
              onClick={() => setSelected(new Set(words.map(w => w.id!)))}
              className="px-2.5 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400
                         active:bg-indigo-50 dark:active:bg-indigo-900/20 rounded-lg"
            >
              {t.selectAll}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400
                         active:bg-gray-100 dark:active:bg-gray-800 rounded-lg"
            >
              {t.deselectAll}
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={() => { setSelectMode(true); setSelected(new Set()); }}
              className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400
                         bg-gray-100 dark:bg-gray-800 rounded-lg active:opacity-70"
            >
              {t.selectMode}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-indigo-600
                         text-white text-xl font-bold leading-none active:scale-90 transition-transform"
            >
              +
            </button>
          </div>
        )}
      </header>

      {/* Sort bar */}
      {words.length > 1 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900
                        border-b border-gray-100 dark:border-gray-800">
          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{t.sortBy}</span>
          <div className="flex gap-1.5">
            {[
              { key: 'alpha', label: alphaLabel,  active: alphaActive,  onClick: cycleAlpha },
              { key: 'conf',  label: confLabel,   active: confActive,   onClick: cycleConf },
              { key: 'rev',   label: revLabel,    active: reviewActive, onClick: cycleReview },
            ].map(btn => (
              <button
                key={btn.key}
                onClick={btn.onClick}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors
                            ${btn.active
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Word list */}
      <div className="flex-1 overflow-y-auto pb-20">
        {words.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-8">
            <p className="text-5xl mb-3">🈳</p>
            <p className="text-gray-500 dark:text-gray-400 font-medium">{t.noWordsTitle}</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">{t.noWordsHint}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {words.map((word, idx) => (
              <li key={word.id} className="bg-white dark:bg-gray-900">
                <div className="flex items-start gap-2 px-4 py-3">
                  {/* Index number */}
                  <span className="w-6 text-right text-xs text-gray-300 dark:text-gray-600
                                   font-mono mt-2 shrink-0 select-none">
                    {idx + 1}
                  </span>
                  {/* Checkbox */}
                  {selectMode && (
                    <button
                      onClick={() => toggleSelect(word.id!)}
                      className={`mt-1 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center
                                  transition-colors
                                  ${selected.has(word.id!)
                                    ? 'bg-indigo-600 border-indigo-600'
                                    : 'border-gray-300 dark:border-gray-600'}`}
                    >
                      {selected.has(word.id!) && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  )}

                  <div
                    className="flex-1 min-w-0"
                    onClick={selectMode ? () => toggleSelect(word.id!) : undefined}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-medium text-gray-900 dark:text-white">
                        {word.hanzi}
                      </span>
                      <span className="text-sm text-indigo-600 dark:text-indigo-400">{word.pinyin}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{word.translation}</p>

                    {/* Inline note */}
                    {word.notes && expandedNote !== word.id && (
                      <button
                        onClick={() => setExpandedNote(word.id!)}
                        className="flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-gray-500
                                   italic active:opacity-70"
                      >
                        <span>📝</span>
                        <span className="truncate max-w-[200px]">{word.notes}</span>
                      </button>
                    )}
                    {expandedNote === word.id && (
                      <textarea
                        autoFocus
                        defaultValue={word.notes ?? ''}
                        onBlur={e => { saveNote(word.id!, e.target.value); setExpandedNote(null); }}
                        placeholder={t.notesPlaceholder}
                        rows={2}
                        className="w-full mt-1.5 px-2 py-1.5 text-xs border border-gray-200
                                   dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800
                                   text-gray-700 dark:text-gray-300 resize-none focus:outline-none
                                   focus:ring-1 focus:ring-indigo-500"
                      />
                    )}

                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <ConfidenceBar value={word.confidence} className="max-w-[80px]" />
                      <span className={`text-xs font-medium ${confidenceColor(word.confidence)}`}>
                        {word.confidence}%
                      </span>
                      {word.reviewCount > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {t.reviewedTimes(word.reviewCount)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons (hidden in select mode) */}
                  {!selectMode && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setExpandedNote(expandedNote === word.id ? null : word.id!)}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors
                                    ${word.notes
                                      ? 'text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                      : 'text-gray-300 dark:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                      >
                        📝
                      </button>
                      {ttsSupported && (
                        <button
                          onClick={() => speak(word.hanzi)}
                          className="w-8 h-8 flex items-center justify-center rounded-full
                                     text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          🔊
                        </button>
                      )}
                      {aiSettings.enabled && (
                        <button
                          onClick={() => setAiWord(word)}
                          className="w-8 h-8 flex items-center justify-center rounded-full
                                     text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          ✨
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(word)}
                        className="w-8 h-8 flex items-center justify-center rounded-full
                                   text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Multi-select action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-4 py-3
                        bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 z-20">
          <div className="flex gap-2">
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex-1 py-3 bg-orange-500 text-white rounded-2xl font-semibold
                         active:scale-95 transition-transform text-sm"
            >
              {t.resetConfidence}
            </button>
            <button
              onClick={() => setShowCopyModal(true)}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-semibold
                         active:scale-95 transition-transform text-sm"
            >
              {t.addToList} ({selected.size})
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {showAdd && (
        <Modal title={t.addWord} onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            {[
              { label: t.hanziLabel,       value: hanzi,       set: setHanzi,       ph: '你好' },
              { label: t.pinyinLabel,      value: pinyin,      set: setPinyin,      ph: 'nǐ hǎo' },
              { label: t.translationLabel, value: translation, set: setTranslation, ph: 'hello' },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {f.label}
                </label>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                             focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t.notesLabel}
              </label>
              <textarea value={noteInput} onChange={e => setNoteInput(e.target.value)}
                placeholder={t.notesPlaceholder} rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                           focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>
            <button onClick={addWord}
              disabled={!hanzi.trim() || !pinyin.trim() || !translation.trim()}
              className="w-full py-3 bg-indigo-600 disabled:opacity-50 text-white rounded-xl
                         font-semibold active:scale-95 transition-transform">
              {t.addWord}
            </button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title={t.deleteWordTitle} onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              {t.deleteWordMsg(deleteTarget.hanzi, deleteTarget.translation)}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl
                           font-medium text-gray-700 dark:text-gray-300">
                {t.cancel}
              </button>
              <button onClick={() => doDelete(deleteTarget)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-medium">
                {t.delete}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showResetConfirm && (
        <Modal title={t.resetConfidence} onClose={() => setShowResetConfirm(false)}>
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              {t.resetConfirmMsg(selected.size)}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl
                           font-medium text-gray-700 dark:text-gray-300">
                {t.cancel}
              </button>
              <button onClick={doResetConfidence}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-medium">
                {t.confirm}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCopyModal && (
        <CopyToListModal
          lang={lang}
          wordIds={[...selected]}
          currentListId={list.id!}
          onClose={() => setShowCopyModal(false)}
          onDone={msg => { alert(msg); exitSelectMode(); setShowCopyModal(false); }}
        />
      )}

      {aiSettings.enabled && aiWord && (
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

// ── CopyToListModal ──────────────────────────────────────────────────────────

interface CopyModalProps {
  lang: Lang;
  wordIds: number[];
  currentListId: number;
  onClose: () => void;
  onDone: (msg: string) => void;
}

function CopyToListModal({ lang, wordIds, currentListId, onClose, onDone }: CopyModalProps) {
  const t = useT(lang);
  const [targetListId, setTargetListId] = useState<number | ''>('');
  const [newListName, setNewListName] = useState('');
  const [loading, setLoading] = useState(false);

  const lists = useLiveQuery(() => db.wordLists.orderBy('name').toArray(), []);
  const otherLists = lists?.filter(l => l.id !== currentListId) ?? [];

  const handleCopy = async () => {
    setLoading(true);
    try {
      let destId: number;
      if (newListName.trim()) {
        destId = (await db.wordLists.add({ name: newListName.trim(), createdAt: Date.now() })) as number;
      } else if (targetListId) {
        destId = targetListId as number;
      } else return;

      let copied = 0;
      for (const wid of wordIds) {
        if (await copyWordToList(wid, destId)) copied++;
      }
      onDone(t.wordsCopied(copied));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={t.copyToList} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {t.selectTarget}
          </label>
          <select value={targetListId}
            onChange={e => { setTargetListId(e.target.value ? Number(e.target.value) : ''); setNewListName(''); }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                       focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">{t.selectTarget}</option>
            {otherLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs text-gray-400 dark:text-gray-500">{t.orNewList}</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>

        <input value={newListName}
          onChange={e => { setNewListName(e.target.value); if (e.target.value) setTargetListId(''); }}
          placeholder={t.newListNamePh}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                     bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500" />

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl
                       font-medium text-gray-700 dark:text-gray-300">
            {t.cancel}
          </button>
          <button onClick={handleCopy}
            disabled={(!targetListId && !newListName.trim()) || loading}
            className="flex-1 py-2.5 bg-indigo-600 disabled:opacity-40 text-white rounded-xl font-medium">
            {t.copy}
          </button>
        </div>
      </div>
    </Modal>
  );
}
