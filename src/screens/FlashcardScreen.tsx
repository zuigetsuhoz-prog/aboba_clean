import { useState, useCallback, useRef, useEffect } from 'react';
import { db, type Word } from '../db';
import { AIModal } from '../components/AIModal';
import { useTTS } from '../hooks/useTTS';
import type { AISettings, CardSide } from '../types';

interface Props {
  words: Word[];
  onExit: () => void;
  aiSettings: AISettings;
  onOpenSettings: () => void;
}

type Direction = 'left' | 'right' | null;

const SIDE_LABELS: Record<CardSide, string> = { 0: '汉字', 1: 'Pīnyīn', 2: 'Translation' };

export function FlashcardScreen({ words: initialWords, onExit, aiSettings, onOpenSettings }: Props) {
  const [words] = useState<Word[]>(initialWords);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [side, setSide] = useState<CardSide>(0);
  const [visitedSides, setVisitedSides] = useState<Set<number>>(new Set([0]));
  const [_direction, setDirection] = useState<Direction>(null);
  const [animClass, setAnimClass] = useState('');
  const [showAI, setShowAI] = useState(false);
  const [ratingFeedback, setRatingFeedback] = useState('');

  const { speak, supported: ttsSupported } = useTTS();
  const animTimeout = useRef<number | undefined>(undefined);

  const currentWord = words[currentIndex];
  const allSidesVisited = visitedSides.size === 3;

  const getSideContent = useCallback((s: CardSide, word: Word): string => {
    return s === 0 ? word.hanzi : s === 1 ? word.pinyin : word.translation;
  }, []);

  const changeSide = useCallback((dir: 'right' | 'left') => {
    if (animClass) return;
    const delta = dir === 'right' ? 1 : -1;
    const newSide = ((side + delta + 3) % 3) as CardSide;

    setDirection(dir);
    setAnimClass(dir === 'right' ? 'slide-out-left' : 'slide-out-right');

    clearTimeout(animTimeout.current);
    animTimeout.current = setTimeout(() => {
      setSide(newSide);
      setVisitedSides(prev => new Set([...prev, newSide]));
      setAnimClass(dir === 'right' ? 'slide-in-right' : 'slide-in-left');
      setTimeout(() => setAnimClass(''), 250);
    }, 200);
  }, [side, animClass]);

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    if (pct < 0.45) changeSide('left');
    else if (pct > 0.55) changeSide('right');
    // center 10% does nothing
  }, [changeSide]);

  const handleSpeakCurrent = () => {
    if (!ttsSupported) return;
    const content = getSideContent(side, currentWord);
    const lang = side === 0 || side === 1 ? 'zh-CN' : 'en-US';
    speak(content, lang);
  };

  const applyRating = async (delta: number, label: string) => {
    const newConfidence = Math.max(0, Math.min(100, currentWord.confidence + delta));
    await db.words.update(currentWord.id!, {
      confidence: newConfidence,
      lastReviewed: Date.now(),
      reviewCount: (currentWord.reviewCount || 0) + 1,
    });

    setRatingFeedback(label);
    setTimeout(() => {
      setRatingFeedback('');
      goNext();
    }, 600);
  };

  const goNext = () => {
    if (currentIndex + 1 >= words.length) {
      onExit();
      return;
    }
    setAnimClass('slide-out-left');
    clearTimeout(animTimeout.current);
    animTimeout.current = setTimeout(() => {
      setCurrentIndex(i => i + 1);
      setSide(0);
      setVisitedSides(new Set([0]));
      setAnimClass('slide-in-right');
      setTimeout(() => setAnimClass(''), 250);
    }, 200);
  };

  useEffect(() => {
    return () => clearTimeout(animTimeout.current);
  }, []);

  if (!currentWord) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-5xl">🎉</p>
        <p className="text-xl font-bold text-gray-900 dark:text-white">Session Complete!</p>
        <button onClick={onExit} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold">
          Done
        </button>
      </div>
    );
  }

  const content = getSideContent(side, currentWord);

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800
                         border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={onExit}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 font-medium
                     active:bg-gray-100 dark:active:bg-gray-700 rounded-lg transition-colors"
        >
          ✕ Exit
        </button>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Card {currentIndex + 1} / {words.length}
        </span>
        <div className="flex gap-1">
          {ttsSupported && (
            <button
              onClick={handleSpeakCurrent}
              className="w-8 h-8 flex items-center justify-center rounded-full
                         text-gray-500 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
            >
              🔊
            </button>
          )}
          <button
            onClick={() => setShowAI(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       text-gray-500 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
          >
            ✨
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
        />
      </div>

      {/* Card area */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-4 select-none cursor-pointer relative overflow-hidden"
        onClick={handleTap}
      >
        {/* Left/right hints */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-700
                        text-2xl font-thin pointer-events-none">‹</div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 dark:text-gray-700
                        text-2xl font-thin pointer-events-none">›</div>

        {/* Side label */}
        <div className="mb-3">
          <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700
                           dark:text-indigo-300 rounded-full text-xs font-semibold">
            {SIDE_LABELS[side]}
          </span>
        </div>

        {/* Card */}
        <div className={`w-full max-w-sm ${animClass}`}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-8 min-h-[180px]
                          flex flex-col items-center justify-center text-center">
            {side === 0 && (
              <p className="text-6xl font-medium text-gray-900 dark:text-white leading-tight">
                {content}
              </p>
            )}
            {side === 1 && (
              <p className="text-3xl text-indigo-600 dark:text-indigo-400 font-medium">
                {content}
              </p>
            )}
            {side === 2 && (
              <p className="text-2xl text-gray-700 dark:text-gray-300 font-medium">
                {content}
              </p>
            )}
          </div>
        </div>

        {/* Side dots */}
        <div className="flex gap-2 mt-4">
          {([0, 1, 2] as CardSide[]).map(s => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                s === side
                  ? 'bg-indigo-600'
                  : visitedSides.has(s)
                  ? 'bg-indigo-300 dark:bg-indigo-700'
                  : 'bg-gray-300 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Nav hint */}
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-600 pointer-events-none">
          Tap left/right to navigate sides
        </p>
      </div>

      {/* Rating buttons */}
      <div className="px-4 pb-24 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        {ratingFeedback ? (
          <div className="py-4 text-center text-lg font-semibold text-gray-700 dark:text-gray-300 fade-in">
            {ratingFeedback}
          </div>
        ) : allSidesVisited ? (
          <div className="py-3">
            <p className="text-xs text-center text-gray-400 dark:text-gray-500 mb-2">
              How well did you know this?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: '完美 Perfect', delta: 20, color: 'bg-green-500' },
                { label: '调错 Tone/Stroke', delta: -5, color: 'bg-yellow-500' },
                { label: '模糊 Vague', delta: -15, color: 'bg-orange-500' },
                { label: '不知道 No idea', delta: -30, color: 'bg-red-500' },
              ].map(r => (
                <button
                  key={r.label}
                  onClick={() => applyRating(r.delta, r.label)}
                  className={`${r.color} text-white py-2.5 rounded-xl text-sm font-medium
                               active:scale-95 transition-transform`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-gray-400 dark:text-gray-500">
            See all 3 sides to rate this card
          </div>
        )}
      </div>

      {showAI && (
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
