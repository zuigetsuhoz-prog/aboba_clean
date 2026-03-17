import type { Word } from './db';

export type Tab = 'lists' | 'study' | 'settings';

export type CardSide = 0 | 1 | 2; // 0=hanzi, 1=pinyin, 2=translation

export interface StudySession {
  sourceListIds: number[];
  filteredWords: Word[];
  currentIndex: number;
  visitedSides: Set<number>; // sides visited for current card (0,1,2)
}

export interface AISettings {
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  model: string;
  endpoint?: string;
}

export interface AppSettings {
  darkMode: boolean;
  ai: AISettings;
}
