import { useState, useCallback, useRef, useEffect } from 'react';
import { db, type Word, calcConfidence, type RatingKey } from '../db';
import { AIModal } from '../components/AIModal';
import { Modal } from '../components/Modal';
import { useTTS } from '../hooks/useTTS';
import { useT } from '../i18n';
import { usePanelContent } from '../contexts/PanelContext';
import type { AISettings, CardSide, Lang } from '../types';

interface Props {
  words: Word[];
  lang: Lang;
  onExit: () => void;
  aiSettings: AISettings;
  onOpenSettings: () => void;
}

interface CardHistoryEntry {
  wordIndex: number;
  side: CardSide;
  visitedSides: number[];
  prevConfidence: number;
  prevReviewCount: number;
  wasRated: boolean;
}

const SIDE_LABELS: Record<CardSide, string> = { 0: '汉字', 1: 'Pīnyīn', 2: 'Translation' };

const RATINGS: { key: RatingKey; labelKey: 'ratePerfect' | 'rateTone' | 'rateVague' | 'rateNoIdea'; color: string }[] = [
  { key: 'perfect', labelKey: 'ratePerfect', color: 'bg-green-500' },
  { key: 'tone',    labelKey: 'rateTone',    color: 'bg-yellow-500' },
  { key: 'vague',   labelKey: 'rateVague',   color: 'bg-orange-500' },
  { key: 'noidea',  labelKey: 'rateNoIdea',  color: 'bg-red-500' },
];

export function FlashcardScreen({ words: initialWords, lang, onExit, aiSettings, onOpenSettings }: Props) {
  const t = useT(lang);
  const setPanel = usePanelContent();

  // ── session state ─────────────────────────────────────────────────────────
  const [words, setWords] = useState<Word[]>(initialWords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [side, setSide] = useState<CardSide>(0);
  const [visitedSides, setVisitedSides] = useState<Set<number>>(new Set([0]));
  const [history, setHistory] = useState<CardHistoryEntry[]>([]);

  // ── animation ─────────────────────────────────────────────────────────────
  const [animClass, setAnimClass] = useState('');
  const animTimeout = useRef<number | undefined>(undefined);

  // ── modals ────────────────────────────────────────────────────────────────
  const [showAI, setShowAI] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState('');

  // ── rating feedback ───────────────────────────────────────────────────────
  const [ratingFeedback, setRatingFeedback] = useState('');

  const { speak, supported: ttsSupported } = useTTS();

  const currentWord = words[currentIndex];

  const getContent = useCallback((s: CardSide, word: Word): string =>
    s === 0 ? word.hanzi : s === 1 ? word.pinyin : word.translation, []);

  // ── side navigation ───────────────────────────────────────────────────────
  const changeSide = useCallback((dir: 'right' | 'left') => {
    if (animClass) return;
    const newSide = ((side + (dir === 'right' ? 1 : -1) + 3) % 3) as CardSide;
    setAnimClass(dir === 'right' ? 'slide-out-left' : 'slide-out-right');
    clearTimeout(animTimeout.current);
    animTimeout.current = window.setTimeout(() => {
      setSide(newSide);
      setVisitedSides(prev => new Set([...prev, newSide]));
      setAnimClass(dir === 'right' ? 'slide-in-right' : 'slide-in-left');
      window.setTimeout(() => setAnimClass(''), 250);
    }, 200);
  }, [side, animClass]);

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const pct = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth;
    if (pct < 0.45) changeSide('left');
    else if (pct > 0.55) changeSide('right');
  }, [changeSide]);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speakCurrent = () => {
    if (!ttsSupported || !currentWord) return;
    speak(getContent(side, currentWord), side === 2 ? 'en-US' : 'zh-CN');
  };

  // ── notes modal ───────────────────────────────────────────────────────────
  const openNote = () => {
    setNoteText(currentWord?.notes ?? '');
    setShowNote(true);
  };
  const saveNote = async () => {
    if (!currentWord) return;
    const trimmed = noteText.trim() || undefined;
    await db.words.update(currentWord.id!, { notes: trimmed });
    setWords(prev => prev.map((w, i) => i === currentIndex ? { ...w, notes: trimmed } : w));
    setShowNote(false);
  };

  // ── advance to next card ──────────────────────────────────────────────────
  const goNext = useCallback((histEntry: CardHistoryEntry) => {
    setHistory(prev => [...prev, histEntry]);
    if (currentIndex + 1 >= words.length) { onExit(); return; }
    setAnimClass('slide-out-left');
    clearTimeout(animTimeout.current);
    animTimeout.current = window.setTimeout(() => {
      setCurrentIndex(i => i + 1);
      setSide(0);
      setVisitedSides(new Set([0]));
      setAnimClass('slide-in-right');
      window.setTimeout(() => setAnimClass(''), 250);
    }, 200);
  }, [currentIndex, words.length, onExit]);

  // ── go back ───────────────────────────────────────────────────────────────
  const goBack = async () => {
    if (history.length === 0) return;
    const entry = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));

    if (entry.wasRated) {
      await db.words.update(words[entry.wordIndex].id!, {
        confidence: entry.prevConfidence,
        reviewCount: entry.prevReviewCount,
        lastReviewed: undefined,
      });
      setWords(prev => prev.map((w, i) =>
        i === entry.wordIndex
          ? { ...w, confidence: entry.prevConfidence, reviewCount: entry.prevReviewCount }
          : w));
    }

    setAnimClass('slide-out-right');
    clearTimeout(animTimeout.current);
    animTimeout.current = window.setTimeout(() => {
      setCurrentIndex(entry.wordIndex);
      setSide(entry.side);
      setVisitedSides(new Set(entry.visitedSides));
      setRatingFeedback('');
      setAnimClass('slide-in-left');
      window.setTimeout(() => setAnimClass(''), 250);
    }, 200);
  };

  // ── rating ────────────────────────────────────────────────────────────────
  const applyRating = async (ratingKey: RatingKey, label: string) => {
    if (!currentWord) return;
    const prevConfidence = currentWord.confidence;
    const prevReviewCount = currentWord.reviewCount;
    const newConfidence = calcConfidence(prevConfidence, ratingKey);

    await db.words.update(currentWord.id!, {
      confidence: newConfidence,
      lastReviewed: Date.now(),
      reviewCount: prevReviewCount + 1,
    });
    setWords(prev => prev.map((w, i) =>
      i === currentIndex ? { ...w, confidence: newConfidence, reviewCount: prevReviewCount + 1 } : w));

    setRatingFeedback(label);
    const hist: CardHistoryEntry = {
      wordIndex: currentIndex,
      side,
      visitedSides: [...visitedSides],
      prevConfidence,
      prevReviewCount,
      wasRated: true,
    };
    window.setTimeout(() => {
      setRatingFeedback('');
      goNext(hist);
    }, 600);
  };

  useEffect(() => () => clearTimeout(animTimeout.current), []);

  // ── right panel: session word list ────────────────────────────────────────
  useEffect(() => {
    setPanel(
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {t.cardProgress(currentIndex + 1, words.length)}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {words.map((w, i) => (
            <div
              key={w.id}
              className={`flex items-center gap-2 px-4 py-2.5
                          border-b border-gray-100 dark:border-gray-800
                          ${i === currentIndex
                            ? 'bg-indigo-50 dark:bg-indigo-900/20'
                            : ''}`}
            >
              <span className="w-5 text-right text-xs text-gray-400 dark:text-gray-600 shrink-0">
                {i + 1}
              </span>
              <span className={`text-xl font-medium shrink-0
                                ${i < currentIndex
                                  ? 'text-gray-300 dark:text-gray-600'
                                  : i === currentIndex
                                    ? 'text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-gray-400'}`}>
                {w.hanzi}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                {w.translation}
              </span>
              {i === currentIndex && (
                <span className="ml-auto text-indigo-500 text-xs shrink-0">▶</span>
              )}
            </div>
          ))}
        </div>
      </div>,
    );
    return () => setPanel(null);
  }, [words, currentIndex, setPanel, t]);

  // ── completion screen ─────────────────────────────────────────────────────
  if (!currentWord) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6
                      bg-gray-100 dark:bg-gray-900">
        <p className="text-5xl">🎉</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white">{t.sessionComplete}</p>
        <button onClick={onExit}
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold">
          {t.done}
        </button>
      </div>
    );
  }

  const content = getContent(side, currentWord);

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2 bg-white dark:bg-gray-800
                         border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-1">
          <button
            onClick={onExit}
            className="px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 font-medium
                       active:bg-gray-100 dark:active:bg-gray-700 rounded-lg"
          >
            {t.exitSession}
          </button>
          <button
            onClick={goBack}
            disabled={history.length === 0}
            className="px-2 py-1.5 text-sm font-medium rounded-lg
                       text-indigo-600 dark:text-indigo-400
                       disabled:opacity-30 active:bg-indigo-50 dark:active:bg-indigo-900/20"
          >
            {t.back}
          </button>
        </div>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t.cardProgress(currentIndex + 1, words.length)}
        </span>
        <div className="flex gap-0.5">
          <button
            onClick={openNote}
            className={`w-8 h-8 flex items-center justify-center rounded-full
                        ${currentWord.notes ? 'text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}
          >
            📝
          </button>
          {ttsSupported && (
            <button onClick={speakCurrent}
              className="w-8 h-8 flex items-center justify-center rounded-full
                         text-gray-500 active:bg-gray-100 dark:active:bg-gray-700">
              🔊
            </button>
          )}
          {aiSettings.enabled && (
            <button onClick={() => setShowAI(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full
                         text-gray-500 active:bg-gray-100 dark:active:bg-gray-700">
              ✨
            </button>
          )}
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700">
        <div className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }} />
      </div>

      {/* Card tap area */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-4 select-none
                   cursor-pointer relative overflow-hidden"
        onClick={handleTap}
      >
        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-700
                        text-2xl pointer-events-none">‹</div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-700
                        text-2xl pointer-events-none">›</div>

        <div className="mb-3">
          <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700
                           dark:text-indigo-300 rounded-full text-xs font-semibold">
            {SIDE_LABELS[side]}
          </span>
        </div>

        <div className={`w-full max-w-sm sm:max-w-md lg:max-w-[520px] xl:max-w-[500px] ${animClass}`}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-8
                          min-h-[180px] sm:min-h-[220px] lg:min-h-[240px]
                          flex flex-col items-center justify-center text-center">
            {side === 0 && (
              <p className="text-6xl font-medium text-gray-900 dark:text-white leading-tight">
                {content}
              </p>
            )}
            {side === 1 && (
              <p className="text-3xl text-indigo-600 dark:text-indigo-400 font-medium">{content}</p>
            )}
            {side === 2 && (
              <p className="text-2xl text-gray-700 dark:text-gray-300 font-medium">{content}</p>
            )}
          </div>
        </div>

        {/* Side dots */}
        <div className="flex gap-2 mt-4">
          {([0, 1, 2] as CardSide[]).map(s => (
            <div key={s} className={`w-2 h-2 rounded-full transition-colors ${
              s === side ? 'bg-indigo-600'
              : visitedSides.has(s) ? 'bg-indigo-300 dark:bg-indigo-700'
              : 'bg-gray-300 dark:bg-gray-700'}`} />
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-600 pointer-events-none">
          {t.tapHint}
        </p>
      </div>

      {/* Rating buttons — always visible */}
      <div className="px-4 pb-4 sm:pb-6 bg-white dark:bg-gray-800
                      border-t border-gray-200 dark:border-gray-700">
        {ratingFeedback ? (
          <div className="py-4 text-center text-lg font-semibold text-gray-700 dark:text-gray-300 fade-in">
            {ratingFeedback}
          </div>
        ) : (
          <div className="py-3">
            <p className="text-xs text-center text-gray-400 dark:text-gray-500 mb-2">{t.howWell}</p>
            <div className="grid grid-cols-2 gap-2">
              {RATINGS.map(r => (
                <button
                  key={r.key}
                  onClick={() => applyRating(r.key, t[r.labelKey])}
                  className={`${r.color} text-white py-2.5 rounded-xl text-sm font-medium
                               active:scale-95 transition-transform`}
                >
                  {t[r.labelKey]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Note modal */}
      {showNote && (
        <Modal title={t.noteModalTitle} onClose={() => setShowNote(false)}>
          <div className="space-y-3">
            <p className="text-2xl font-medium text-gray-900 dark:text-white">
              {currentWord.hanzi}
              <span className="text-base text-indigo-500 ml-2">{currentWord.pinyin}</span>
            </p>
            <textarea
              autoFocus
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder={t.notesPlaceholder}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <button
              onClick={saveNote}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-medium
                         active:scale-95 transition-transform"
            >
              {t.noteSave}
            </button>
          </div>
        </Modal>
      )}

      {aiSettings.enabled && showAI && (
        <AIModal
          hanzi={currentWord.hanzi}
          settings={aiSettings}
          onClose={() => setShowAI(false)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}
