import { useState, useCallback, useRef, useEffect } from 'react';
import { db, type Word, calcConfidence, type RatingKey } from '../db';
import { AIModal } from '../components/AIModal';
import { Modal } from '../components/Modal';
import { playPinyin } from '../utils/pinyinAudio';
import { useT } from '../i18n';
import { usePanelContent } from '../contexts/PanelContext';
import type { AISettings, CardSide, Lang } from '../types';

interface Props {
  words: Word[];
  lang: Lang;
  onExit: () => void;
  aiSettings: AISettings;
  onOpenSettings: () => void;
  initialSide?: CardSide;
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

export function FlashcardScreen({ words: initialWords, lang, onExit, aiSettings, onOpenSettings, initialSide = 0 }: Props) {
  const t = useT(lang);
  const setPanel = usePanelContent();

  // ── session state ─────────────────────────────────────────────────────────
  const [words, setWords] = useState<Word[]>(initialWords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [side, setSide] = useState<CardSide>(initialSide);
  const [visitedSides, setVisitedSides] = useState<Set<number>>(new Set([initialSide]));
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

  // ── audio state ───────────────────────────────────────────────────────────
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioError, setAudioError] = useState('');

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
      window.setTimeout(() => setAnimClass(''), 150);
    }, 100);
  }, [side, animClass]);

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const pct = (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.offsetWidth;
    if (pct < 0.45) changeSide('left');
    else if (pct > 0.55) changeSide('right');
  }, [changeSide]);

  // ── audio playback ────────────────────────────────────────────────────────
  const speakCurrent = async () => {
    if (audioPlaying || !currentWord) return;
    // Only play audio for Chinese sides (hanzi/pinyin); skip translation
    if (side === 2) return;
    setAudioPlaying(true);
    setAudioError('');
    const result = await playPinyin(currentWord.pinyin);
    setAudioPlaying(false);
    if (result === 'none') {
      setAudioError(t.audioUnavailable);
      setTimeout(() => setAudioError(''), 3000);
    }
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
      setSide(initialSide);
      setVisitedSides(new Set([initialSide]));
      setAnimClass('slide-in-right');
      window.setTimeout(() => setAnimClass(''), 150);
    }, 100);
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
      window.setTimeout(() => setAnimClass(''), 150);
    }, 100);
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
    // Right panel: sticky header + plain list (panel aside is the scroll container)
    setPanel(
      <div>
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700
                        sticky top-0 bg-white dark:bg-gray-900 z-10">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {t.cardProgress(currentIndex + 1, words.length)}
          </p>
        </div>
        {words.map((w, i) => (
          <div
            key={w.id}
            className={`flex items-center gap-2 px-4 py-2.5
                        border-b border-gray-100 dark:border-gray-800
                        ${i === currentIndex ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
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
      </div>,
    );
    return () => setPanel(null);
  }, [words, currentIndex, setPanel, t]);

  // ── completion screen ─────────────────────────────────────────────────────
  if (!currentWord) {
    return (
      <div className="flex flex-col items-center justify-center min-h-svh gap-4 px-6
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
    // height:100% fills the scroll container; overflow:hidden prevents any internal scroll
    <div className="bg-gray-100 dark:bg-gray-900" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* ── Top bar ── flex-shrink:0 */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            onClick={onExit}
            className="px-2 py-1.5 text-sm text-gray-600 dark:text-gray-400 font-medium
                       active:bg-gray-100 dark:active:bg-gray-700 rounded-lg"
          >{t.exitSession}</button>
          <button
            onClick={goBack}
            disabled={history.length === 0}
            className="px-2 py-1.5 text-sm font-medium rounded-lg
                       text-indigo-600 dark:text-indigo-400
                       disabled:opacity-30 active:bg-indigo-50 dark:active:bg-indigo-900/20"
          >{t.back}</button>
        </div>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t.cardProgress(currentIndex + 1, words.length)}
        </span>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          <button onClick={openNote}
            className={`w-8 h-8 flex items-center justify-center rounded-full
                        ${currentWord.notes ? 'text-amber-400' : 'text-gray-400 dark:text-gray-600'}`}>
            📝
          </button>
          {/* Audio button — only shown on Chinese sides */}
          {side !== 2 && (
            <button
              onClick={speakCurrent}
              disabled={audioPlaying}
              className={`w-8 h-8 flex items-center justify-center rounded-full
                         transition-opacity
                         ${audioPlaying ? 'opacity-50' : 'text-gray-500 active:bg-gray-100 dark:active:bg-gray-700'}`}
              aria-label="Play pronunciation"
            >
              {audioPlaying ? '⏳' : '🔊'}
            </button>
          )}
          {aiSettings.enabled && (
            <button onClick={() => setShowAI(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full
                         text-gray-500 active:bg-gray-100 dark:active:bg-gray-700">✨</button>
          )}
        </div>
      </header>

      {/* ── Progress bar ── flex-shrink:0 */}
      <div className="bg-gray-200 dark:bg-gray-700" style={{ flexShrink: 0, height: '3px' }}>
        <div className="bg-indigo-500 h-full transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }} />
      </div>

      {/* ── Card area ── flex:1, min-height:0, no scroll */}
      <div
        onClick={handleTap}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', cursor: 'pointer', userSelect: 'none', position: 'relative', overflow: 'hidden' }}
      >
        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-700
                        text-2xl pointer-events-none">‹</div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-700
                        text-2xl pointer-events-none">›</div>

        {/* Side badge */}
        <div style={{ flexShrink: 0, marginBottom: '8px' }}>
          <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700
                           dark:text-indigo-300 rounded-full text-xs font-semibold">
            {SIDE_LABELS[side]}
          </span>
        </div>

        {/* Card — flex:1 min-height:0 so it shrinks on small screens */}
        <div className={`w-full ${animClass}`}
          style={{ flex: 1, minHeight: 0, maxWidth: '520px', display: 'flex', flexDirection: 'column' }}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md
                          flex flex-col items-center justify-center text-center"
            style={{ flex: 1, minHeight: 0, padding: '24px 20px' }}>
            {side === 0 && (
              <p className="font-medium text-gray-900 dark:text-white leading-tight"
                style={{ fontSize: 'clamp(2rem, 8vw, 4rem)' }}>{content}</p>
            )}
            {side === 1 && (
              <p className="text-indigo-600 dark:text-indigo-400 font-medium"
                style={{ fontSize: 'clamp(1.25rem, 5vw, 2rem)' }}>{content}</p>
            )}
            {side === 2 && (
              <p className="text-gray-700 dark:text-gray-300 font-medium"
                style={{ fontSize: 'clamp(1rem, 4vw, 1.5rem)' }}>{content}</p>
            )}
          </div>
        </div>

        {/* Dots */}
        <div style={{ flexShrink: 0, display: 'flex', gap: '8px', marginTop: '8px' }}>
          {([0, 1, 2] as CardSide[]).map(s => (
            <div key={s} className={`w-2 h-2 rounded-full transition-colors ${
              s === side ? 'bg-indigo-600'
              : visitedSides.has(s) ? 'bg-indigo-300 dark:bg-indigo-700'
              : 'bg-gray-300 dark:bg-gray-700'}`} />
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-600 pointer-events-none"
          style={{ flexShrink: 0, marginTop: '4px' }}>
          {t.tapHint}
        </p>
      </div>

      {/* ── Rating section ── flex-shrink:0 */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
        style={{ flexShrink: 0, padding: '8px 16px 10px' }}>
        {ratingFeedback ? (
          <div className="text-center text-base font-semibold text-gray-700 dark:text-gray-300 fade-in"
            style={{ padding: '10px 0' }}>
            {ratingFeedback}
          </div>
        ) : (
          <>
            <p className="text-xs text-center text-gray-400 dark:text-gray-500"
              style={{ marginBottom: '6px' }}>{t.howWell}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {RATINGS.map(r => (
                <button
                  key={r.key}
                  onClick={() => applyRating(r.key, t[r.labelKey])}
                  className={`${r.color} text-white rounded-xl text-sm font-medium
                               active:scale-95 transition-transform`}
                  style={{ padding: '10px 8px' }}
                >
                  {t[r.labelKey]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Audio error toast */}
      {audioError && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2
                        bg-gray-800 text-white text-xs px-4 py-2 rounded-full
                        shadow-lg fade-in pointer-events-none z-20">
          {audioError}
        </div>
      )}

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
