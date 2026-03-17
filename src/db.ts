import Dexie, { type Table } from 'dexie';

export interface WordList {
  id?: number;
  name: string;
  description?: string;
  createdAt: number;
}

export interface Word {
  id?: number;
  listId: number;
  hanzi: string;
  pinyin: string;
  translation: string;
  confidence: number; // 0–100
  lastReviewed?: number;
  reviewCount: number;
}

export class ChineseDB extends Dexie {
  wordLists!: Table<WordList>;
  words!: Table<Word>;

  constructor() {
    super('ChineseLearningDB');
    this.version(1).stores({
      wordLists: '++id, name, createdAt',
      words: '++id, listId, confidence, lastReviewed',
    });
  }
}

export const db = new ChineseDB();
