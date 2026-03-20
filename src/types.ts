import type { Word } from './db';
import type { Lang } from './i18n';

export type Tab = 'lists' | 'study' | 'settings' | 'search';

export type CardSide = 0 | 1 | 2; // 0=hanzi, 1=pinyin, 2=translation

export type SortOption = 'default' | 'az' | 'za' | 'conf-asc' | 'conf-desc' | 'review-asc' | 'review-desc';

export interface StudySession {
  sourceListIds: number[];
  filteredWords: Word[];
  currentIndex: number;
  visitedSides: Set<number>;
}

export interface AISettings {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'custom';
  apiKey: string;
  model: string;
  endpoint?: string;
}

export interface AppSettings {
  darkMode: boolean;
  language: Lang;
  ai: AISettings;
}

export type { Lang };
