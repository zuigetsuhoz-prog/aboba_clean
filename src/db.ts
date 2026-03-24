import Dexie, { type Table } from 'dexie';

export interface WordList {
  id?: number;
  name: string;
  description?: string;
  createdAt: number;
  syncId?: string;
  sortOrder?: number;
}

export interface Word {
  id?: number;
  hanzi: string;
  pinyin: string;
  translation: string;
  confidence: number; // 0–100
  lastReviewed?: number;
  reviewCount: number;
  notes?: string;
  syncId?: string;
  createdAt?: number;
  sortOrder?: number;
}

/** Junction table: which word belongs to which list */
export interface WordRef {
  id?: number;
  listId: number;
  wordId: number;
  syncId?: string;
}

export class ChineseDB extends Dexie {
  wordLists!: Table<WordList>;
  words!: Table<Word>;
  wordRefs!: Table<WordRef>;

  constructor() {
    super('ChineseLearningDB');

    // V1: original schema (words had listId)
    this.version(1).stores({
      wordLists: '++id, name, createdAt',
      words: '++id, listId, confidence, lastReviewed',
    });

    // V2: extract listId into wordRefs junction table, add notes
    this.version(2).stores({
      wordLists: '++id, name, createdAt',
      words: '++id, confidence, lastReviewed',
      wordRefs: '++id, listId, wordId, [listId+wordId]',
    }).upgrade(async tx => {
      // Migrate existing words: create a wordRef for each word that has a listId
      const oldWords = await tx.table<Word & { listId?: number }>('words').toArray();
      const refs = oldWords
        .filter(w => w.listId !== undefined && w.id !== undefined)
        .map(w => ({ listId: w.listId!, wordId: w.id! }));
      if (refs.length > 0) {
        await tx.table('wordRefs').bulkAdd(refs);
      }
    });

    // V3: add syncId index for Supabase sync
    this.version(3).stores({
      wordLists: '++id, name, createdAt, syncId',
      words: '++id, confidence, lastReviewed, syncId',
      wordRefs: '++id, listId, wordId, [listId+wordId], syncId',
    });

    // V4: add sortOrder for user-controlled list ordering
    this.version(4).stores({
      wordLists: '++id, name, createdAt, syncId, sortOrder',
      words: '++id, confidence, lastReviewed, syncId',
      wordRefs: '++id, listId, wordId, [listId+wordId], syncId',
    }).upgrade(async tx => {
      // Preserve existing order (newest first) as initial sortOrder
      const lists = await tx.table('wordLists').toArray();
      lists.sort((a: WordList, b: WordList) => b.createdAt - a.createdAt);
      await Promise.all(lists.map((l: WordList, i: number) =>
        tx.table('wordLists').update(l.id!, { sortOrder: i }),
      ));
    });
  }
}

export const db = new ChineseDB();

// ─── Helpers ────────────────────────────────────────────────────────────────

export async function getWordsForList(listId: number): Promise<Word[]> {
  const refs = await db.wordRefs.where('listId').equals(listId).toArray();
  if (refs.length === 0) return [];
  refs.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const words = await db.words.bulkGet(refs.map(r => r.wordId));
  const result = words.filter((w): w is Word => w !== undefined);
  result.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return result;
}

export async function getWordCountForList(listId: number): Promise<number> {
  return db.wordRefs.where('listId').equals(listId).count();
}

export async function addWordToList(
  listId: number,
  data: Omit<Word, 'id'>,
): Promise<number> {
  const sortOrder = data.sortOrder ?? (await db.wordRefs.where('listId').equals(listId).count());
  const wordId = (await db.words.add({ ...data, sortOrder })) as number;
  await db.wordRefs.add({ listId, wordId });
  return wordId;
}

/** Copy an existing word (by id) into another list. Skips if already there. */
export async function copyWordToList(wordId: number, listId: number): Promise<boolean> {
  const existing = await db.wordRefs.where({ listId, wordId }).first();
  if (existing) return false; // already there
  await db.wordRefs.add({ listId, wordId });
  return true;
}

/** Remove a word from a list; if no refs remain, delete the word itself. */
export async function deleteWordFromList(wordId: number, listId: number): Promise<void> {
  await db.wordRefs.where({ listId, wordId }).delete();
  const remaining = await db.wordRefs.where('wordId').equals(wordId).count();
  if (remaining === 0) {
    await db.words.delete(wordId);
  }
}

/** Delete an entire list and all orphaned words. */
export async function deleteList(listId: number): Promise<void> {
  const refs = await db.wordRefs.where('listId').equals(listId).toArray();
  await db.wordRefs.where('listId').equals(listId).delete();
  // Delete words that have no other list
  for (const ref of refs) {
    const count = await db.wordRefs.where('wordId').equals(ref.wordId).count();
    if (count === 0) await db.words.delete(ref.wordId);
  }
  await db.wordLists.delete(listId);
}

/** Normalize pinyin by stripping tone diacritics for comparison */
export function stripTones(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove combining diacritical marks
    .toLowerCase();
}

export type RatingKey = 'perfect' | 'tone' | 'vague' | 'noidea';

/** Confidence scoring formulas */
export function calcConfidence(current: number, rating: RatingKey): number {
  let next: number;
  switch (rating) {
    case 'perfect': next = current + Math.max(3, 20 - current / 6); break;
    case 'tone':    next = current - 8; break;
    case 'vague':   next = current - Math.max(15, current / 3); break;
    case 'noidea':  next = 0; break;
  }
  return Math.round(Math.max(0, Math.min(100, next)));
}
