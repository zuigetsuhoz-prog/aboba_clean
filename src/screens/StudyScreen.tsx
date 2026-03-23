import { useState, useMemo, useRef, useEffect } from 'react';
import { db, type Word, getWordsForList, stripTones } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { FlashcardScreen } from './FlashcardScreen';
import { useT } from '../i18n';
import type { AISettings, CardSide, Lang } from '../types';

const SUBLIST_SIZE = 25;

interface Props {
  aiSettings: AISettings;
  lang: Lang;
  onOpenSettings: () => void;
}

interface SelectionState {
  fullSelected: Set<number>;
  subSelected: Map<number, Set<number>>;
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
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow
                    transition-transform duration-200
                    ${on ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 accent-indigo-600 shrink-0"
    />
  );
}

export function StudyScreen({ aiSettings, lang, onOpenSettings }: Props) {
  const t = useT(lang);

  const [selection, setSelection] = useState<SelectionState>({
    fullSelected: new Set(),
    subSelected: new Map(),
  });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [startFrom, setStartFrom] = useState('1');
  const [limitCount, setLimitCount] = useState('100');
  const [pinyinFilter, setPinyinFilter] = useState('');
  const [maxConfidence, setMaxConfidence] = useState('');
  const [shuffle, setShuffle] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [startFace, setStartFace] = useState<CardSide>(0);
  const [session, setSession] = useState<Word[] | null>(null);

  const lists = useLiveQuery(() => db.wordLists.orderBy('name').toArray(), []);

  // Word count per list — used to compute number of sublists
  const wordCounts = useLiveQuery<Record<number, number>>(async () => {
    if (!lists) return {};
    const counts: Record<number, number> = {};
    for (const l of lists) {
      counts[l.id!] = await db.wordRefs.where('listId').equals(l.id!).count();
    }
    return counts;
  }, [lists]);

  // Fetch and merge words for the current selection
  const allWords = useLiveQuery<Word[]>(async () => {
    const { fullSelected, subSelected } = selection;
    const hasSubSel = [...subSelected.values()].some(s => s.size > 0);
    if (fullSelected.size === 0 && !hasSubSel) return [];

    const seen = new Set<number>();
    const flat: Word[] = [];

    for (const listId of fullSelected) {
      const words = await getWordsForList(listId);
      for (const w of words) {
        if (!seen.has(w.id!)) { seen.add(w.id!); flat.push(w); }
      }
    }

    for (const [listId, subIndices] of subSelected) {
      if (subIndices.size === 0 || fullSelected.has(listId)) continue;
      const words = await getWordsForList(listId);
      for (const idx of [...subIndices].sort((a, b) => a - b)) {
        const start = idx * SUBLIST_SIZE;
        const end = start + SUBLIST_SIZE;
        for (const w of words.slice(start, end)) {
          if (!seen.has(w.id!)) { seen.add(w.id!); flat.push(w); }
        }
      }
    }

    flat.sort((a, b) => a.confidence - b.confidence);
    return flat;
  }, [selection]);

  const toggleParent = (listId: number, numSublists: number) => {
    setSelection(prev => {
      const isFull = prev.fullSelected.has(listId);
      const listSubSel = prev.subSelected.get(listId) ?? new Set<number>();
      const allSubsSelected = numSublists > 0 && listSubSel.size === numSublists;

      const newFull = new Set(prev.fullSelected);
      const newSub = new Map(prev.subSelected);

      if (isFull || allSubsSelected) {
        newFull.delete(listId);
        newSub.delete(listId);
      } else {
        // Indeterminate or unchecked → select full list
        newFull.add(listId);
        newSub.delete(listId);
      }
      return { fullSelected: newFull, subSelected: newSub };
    });
  };

  const toggleSublist = (listId: number, subIdx: number, numSublists: number) => {
    setSelection(prev => {
      const newFull = new Set(prev.fullSelected);
      const newSub = new Map(prev.subSelected);

      if (prev.fullSelected.has(listId)) {
        // Was fully selected → switch to partial (all except clicked)
        newFull.delete(listId);
        const allExceptThis = new Set(
          Array.from({ length: numSublists }, (_, i) => i).filter(i => i !== subIdx),
        );
        if (allExceptThis.size > 0) newSub.set(listId, allExceptThis);
      } else {
        const existing = new Set(prev.subSelected.get(listId) ?? new Set<number>());
        if (existing.has(subIdx)) existing.delete(subIdx);
        else existing.add(subIdx);

        if (existing.size === 0) {
          newSub.delete(listId);
        } else if (existing.size === numSublists) {
          // All sublists checked → promote to full
          newSub.delete(listId);
          newFull.add(listId);
        } else {
          newSub.set(listId, existing);
        }
      }
      return { fullSelected: newFull, subSelected: newSub };
    });
  };

  const toggleExpand = (listId: number) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(listId)) n.delete(listId);
      else n.add(listId);
      return n;
    });
  };

  const filteredPreview = useMemo(() => {
    if (!allWords) return [];
    let words = [...allWords];

    if (pinyinFilter.trim()) {
      const f = stripTones(pinyinFilter.trim());
      words = words.filter(w => stripTones(w.pinyin).startsWith(f));
    }

    if (maxConfidence.trim()) {
      const max = parseInt(maxConfidence, 10);
      if (!isNaN(max)) words = words.filter(w => w.confidence <= max);
    }

    const start = parseInt(startFrom, 10);
    const count = parseInt(limitCount, 10);
    if (!isNaN(start) && !isNaN(count) && start >= 1 && count >= 1) {
      words = words.slice(start - 1, start - 1 + count);
    }

    if (shuffle) {
      words = [...words].sort(() => Math.random() - 0.5);
    }

    return words;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWords, pinyinFilter, maxConfidence, startFrom, limitCount, shuffle]);

  const startSession = () => {
    if (filteredPreview.length === 0) return;
    setSession([...filteredPreview]);
  };

  if (session) {
    return (
      <FlashcardScreen
        words={session}
        lang={lang}
        onExit={() => setSession(null)}
        aiSettings={aiSettings}
        onOpenSettings={onOpenSettings}
        initialSide={startFace}
        autoPlay={autoPlay}
      />
    );
  }

  const hasAnySelection =
    selection.fullSelected.size > 0 ||
    [...selection.subSelected.values()].some(s => s.size > 0);

  return (
    <div className="flex flex-col">
      <header className="px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700
                         sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">{t.newSession}</h1>
      </header>

      <div className="pb-20">
        {/* Source lists */}
        <section className="mt-4 px-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {t.sourceLists}
          </h2>
          {!lists || lists.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">{t.noListsForStudy}</p>
          ) : (
            <div className="space-y-1">
              {lists.map(l => {
                const wordCount = wordCounts?.[l.id!] ?? 0;
                const numSublists = Math.ceil(wordCount / SUBLIST_SIZE);
                const isExpanded = expanded.has(l.id!);
                const isFull = selection.fullSelected.has(l.id!);
                const listSubSel = selection.subSelected.get(l.id!) ?? new Set<number>();
                const allSubsSelected = numSublists > 0 && listSubSel.size === numSublists;
                const parentChecked = isFull || allSubsSelected;
                const parentIndeterminate = !parentChecked && listSubSel.size > 0;

                return (
                  <div key={l.id} className="space-y-0.5">
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-gray-800
                                    rounded-xl">
                      <TriCheckbox
                        checked={parentChecked}
                        indeterminate={parentIndeterminate}
                        onChange={() => toggleParent(l.id!, numSublists)}
                      />
                      <span className="flex-1 text-gray-900 dark:text-white font-medium">{l.name}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">{wordCount}</span>
                      {numSublists > 1 && (
                        <button
                          onClick={() => toggleExpand(l.id!)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-xs
                                     text-gray-400 dark:text-gray-500
                                     hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          aria-label={isExpanded ? 'Collapse sublists' : 'Expand sublists'}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      )}
                    </div>

                    {isExpanded && numSublists > 0 && (
                      <div className="ml-6 space-y-0.5">
                        {Array.from({ length: numSublists }, (_, idx) => {
                          const rangeStart = idx * SUBLIST_SIZE + 1;
                          const rangeEnd = Math.min((idx + 1) * SUBLIST_SIZE, wordCount);
                          const isSubChecked = isFull || listSubSel.has(idx);
                          return (
                            <label
                              key={idx}
                              className="flex items-center gap-3 px-3 py-2
                                         bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer
                                         active:bg-gray-100 dark:active:bg-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={isSubChecked}
                                onChange={() => toggleSublist(l.id!, idx, numSublists)}
                                className="w-4 h-4 accent-indigo-600 shrink-0"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {l.name} ({rangeStart}–{rangeEnd})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Filters */}
        <section className="mt-5 px-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            {t.filters}
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-3 space-y-3">
            <div className="flex items-center gap-3">
              <label className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {t.startFromWord}
              </label>
              <input type="number" min="1" value={startFrom}
                onChange={e => setStartFrom(e.target.value)}
                placeholder="1"
                className="w-24 shrink-0 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {t.numWords}
              </label>
              <input type="number" min="1" value={limitCount}
                onChange={e => setLimitCount(e.target.value)}
                placeholder="100"
                className="w-24 shrink-0 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {t.pinyinStarts}
              </label>
              <input type="text" value={pinyinFilter}
                onChange={e => setPinyinFilter(e.target.value)}
                placeholder={t.pinyinPh}
                className="w-24 shrink-0 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {t.maxConfidence}
              </label>
              <input type="number" min="0" max="100" value={maxConfidence}
                onChange={e => setMaxConfidence(e.target.value)}
                placeholder="100"
                className="w-24 shrink-0 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg
                           bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {t.randomShuffle}
              </label>
              <Toggle on={shuffle} onToggle={() => setShuffle(s => !s)} />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {t.autoPlayAudio}
              </label>
              <Toggle on={autoPlay} onToggle={() => setAutoPlay(s => !s)} />
            </div>
            <div className="flex items-start gap-3">
              <label className="flex-1 text-sm text-gray-700 dark:text-gray-300 pt-1">
                {t.startingFace}
              </label>
              <div className="flex gap-2 flex-wrap">
                {([0, 1, 2] as CardSide[]).map((face, i) => {
                  const labels = [t.startingFaceHanzi, t.startingFacePinyin, t.startingFaceTranslation];
                  return (
                    <button
                      key={face}
                      onClick={() => setStartFace(face)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                        ${startFace === face
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}
                    >
                      {labels[i]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Preview count */}
        {hasAnySelection && (
          <div className="mt-4 px-4">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200
                            dark:border-indigo-800 rounded-xl p-3 text-center">
              <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                {filteredPreview.length}
              </span>
              <span className="text-sm text-indigo-600 dark:text-indigo-400 ml-1">
                {t.wordsSelected}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Start button — sticks to viewport bottom while scrolling */}
      <div className="sticky bottom-0 px-4 py-3 bg-white dark:bg-gray-900
                      border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={startSession}
          disabled={filteredPreview.length === 0}
          className="w-full py-3.5 bg-indigo-600 disabled:opacity-40 text-white rounded-2xl
                     font-semibold text-base active:scale-95 transition-transform"
        >
          {t.startSession}
        </button>
      </div>
    </div>
  );
}
