import { supabase } from './supabase';
import { db } from './db';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
export type SyncProgress = { loaded: number; total: number } | null;

type ProgressFn = (loaded: number, total: number) => void;

const PAGE = 500;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchAllPages<T>(
  table: string,
  userId: string,
  onProgress?: (loaded: number) => void,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    onProgress?.(all.length);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function insertInChunks<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onProgress?: ProgressFn,
): Promise<void> {
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) {
      console.error(`Supabase sync error (${table}):`, JSON.stringify(error));
      throw error;
    }
    onProgress?.(Math.min(i + PAGE, rows.length), rows.length);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch all user data from Supabase and UPSERT into local IndexedDB.
 * Existing local records (matched by syncId) are updated; new ones are inserted.
 * Local-only records (no syncId match on server) are left untouched.
 */
export async function mergeFromSupabase(
  userId: string,
  onProgress?: ProgressFn,
): Promise<void> {
  const [sbLists, sbWords, sbRefs] = await Promise.all([
    fetchAllPages<Record<string, unknown>>('word_lists', userId),
    fetchAllPages<Record<string, unknown>>('words', userId, n => onProgress?.(n, 0)),
    fetchAllPages<Record<string, unknown>>('word_refs', userId),
  ]);

  await db.transaction('rw', [db.wordLists, db.words, db.wordRefs], async () => {
    // ── Upsert word lists ──────────────────────────────────────────────────
    const listIdMap = new Map<string, number>(); // server uuid → local id
    for (const l of sbLists) {
      const existing = await db.wordLists.where('syncId').equals(l.id as string).first();
      if (existing) {
        await db.wordLists.update(existing.id!, {
          name: l.name as string,
          description: (l.description as string | null) ?? undefined,
          createdAt: new Date(l.created_at as string).getTime(),
        });
        listIdMap.set(l.id as string, existing.id!);
      } else {
        const localId = (await db.wordLists.add({
          name: l.name as string,
          description: (l.description as string | null) ?? undefined,
          createdAt: new Date(l.created_at as string).getTime(),
          syncId: l.id as string,
        })) as number;
        listIdMap.set(l.id as string, localId);
      }
    }

    // ── Upsert words ───────────────────────────────────────────────────────
    const wordIdMap = new Map<string, number>(); // server uuid → local id
    for (const w of sbWords) {
      const existing = await db.words.where('syncId').equals(w.id as string).first();
      if (existing) {
        await db.words.update(existing.id!, {
          hanzi: w.hanzi as string,
          pinyin: w.pinyin as string,
          translation: w.translation as string,
          confidence: w.confidence as number,
          reviewCount: w.review_count as number,
          notes: (w.notes as string | null) ?? undefined,
          lastReviewed: w.last_reviewed ? new Date(w.last_reviewed as string).getTime() : undefined,
        });
        wordIdMap.set(w.id as string, existing.id!);
      } else {
        const localId = (await db.words.add({
          hanzi: w.hanzi as string,
          pinyin: w.pinyin as string,
          translation: w.translation as string,
          confidence: w.confidence as number,
          reviewCount: w.review_count as number,
          notes: (w.notes as string | null) ?? undefined,
          lastReviewed: w.last_reviewed ? new Date(w.last_reviewed as string).getTime() : undefined,
          syncId: w.id as string,
        })) as number;
        wordIdMap.set(w.id as string, localId);
      }
    }

    // ── Upsert word refs ───────────────────────────────────────────────────
    for (const r of sbRefs) {
      const existing = r.id ? await db.wordRefs.where('syncId').equals(r.id as string).first() : undefined;
      if (!existing) {
        const localListId = listIdMap.get(r.list_id as string);
        const localWordId = wordIdMap.get(r.word_id as string);
        if (localListId !== undefined && localWordId !== undefined) {
          const byIds = await db.wordRefs.where({ listId: localListId, wordId: localWordId }).first();
          if (!byIds) {
            await db.wordRefs.add({ listId: localListId, wordId: localWordId, syncId: r.id as string });
          } else if (!byIds.syncId) {
            await db.wordRefs.update(byIds.id!, { syncId: r.id as string });
          }
        }
      }
    }
  });
}

/**
 * Pull all user data from Supabase and OVERWRITE local IndexedDB completely.
 * Used for the "Pull from cloud" force-download action.
 */
export async function overwriteLocalWithSupabase(
  userId: string,
  onProgress?: ProgressFn,
): Promise<void> {
  const [sbLists, sbWords, sbRefs] = await Promise.all([
    fetchAllPages<Record<string, unknown>>('word_lists', userId),
    fetchAllPages<Record<string, unknown>>('words', userId, n => onProgress?.(n, 0)),
    fetchAllPages<Record<string, unknown>>('word_refs', userId),
  ]);

  await db.transaction('rw', [db.wordLists, db.words, db.wordRefs], async () => {
    await db.wordRefs.clear();
    await db.words.clear();
    await db.wordLists.clear();

    const listIdMap = new Map<string, number>();
    for (const l of sbLists) {
      const localId = (await db.wordLists.add({
        name: l.name as string,
        description: (l.description as string | null) ?? undefined,
        createdAt: new Date(l.created_at as string).getTime(),
        syncId: l.id as string,
      })) as number;
      listIdMap.set(l.id as string, localId);
    }

    const wordIdMap = new Map<string, number>();
    for (const w of sbWords) {
      const localId = (await db.words.add({
        hanzi: w.hanzi as string,
        pinyin: w.pinyin as string,
        translation: w.translation as string,
        confidence: w.confidence as number,
        reviewCount: w.review_count as number,
        notes: (w.notes as string | null) ?? undefined,
        lastReviewed: w.last_reviewed ? new Date(w.last_reviewed as string).getTime() : undefined,
        syncId: w.id as string,
      })) as number;
      wordIdMap.set(w.id as string, localId);
    }

    for (const r of sbRefs) {
      const localListId = listIdMap.get(r.list_id as string);
      const localWordId = wordIdMap.get(r.word_id as string);
      if (localListId !== undefined && localWordId !== undefined) {
        await db.wordRefs.add({ listId: localListId, wordId: localWordId, syncId: r.id as string });
      }
    }
  });
}

/**
 * Push all local data to Supabase (replace-all strategy):
 * deletes all user records in Supabase then re-inserts everything.
 * Assigns UUIDs (syncId) to local records that don't have one yet.
 */
export async function pushToSupabase(
  userId: string,
  onProgress?: ProgressFn,
): Promise<void> {
  const lists = await db.wordLists.toArray();
  const words = await db.words.toArray();
  const refs = await db.wordRefs.toArray();

  // Assign syncIds where missing
  for (const list of lists) {
    if (!list.syncId) {
      list.syncId = crypto.randomUUID();
      await db.wordLists.update(list.id!, { syncId: list.syncId });
    }
  }
  for (const word of words) {
    if (!word.syncId) {
      word.syncId = crypto.randomUUID();
      await db.words.update(word.id!, { syncId: word.syncId });
    }
  }
  for (const ref of refs) {
    if (!ref.syncId) {
      ref.syncId = crypto.randomUUID();
      await db.wordRefs.update(ref.id!, { syncId: ref.syncId });
    }
  }

  const listMap = new Map(lists.map(l => [l.id!, l.syncId!]));
  const wordMap = new Map(words.map(w => [w.id!, w.syncId!]));

  // Delete all existing user data in Supabase
  await supabase.from('word_refs').delete().eq('user_id', userId);
  await supabase.from('words').delete().eq('user_id', userId);
  await supabase.from('word_lists').delete().eq('user_id', userId);

  if (lists.length > 0) {
    await insertInChunks(
      'word_lists',
      lists.map(l => ({
        id: l.syncId!,
        user_id: userId,
        name: l.name,
        description: l.description ?? null,
        created_at: new Date(l.createdAt).toISOString(),
      })),
    );
  }

  if (words.length > 0) {
    await insertInChunks(
      'words',
      words.map(w => ({
        id: w.syncId!,
        user_id: userId,
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        translation: w.translation,
        confidence: w.confidence,
        review_count: w.reviewCount,
        notes: w.notes ?? null,
        last_reviewed: w.lastReviewed ? new Date(w.lastReviewed).toISOString() : null,
      })),
      onProgress,
    );
  }

  if (refs.length > 0) {
    const refsData = refs
      .map(r => ({
        id: r.syncId!,
        user_id: userId,
        list_id: listMap.get(r.listId),
        word_id: wordMap.get(r.wordId),
      }))
      .filter((r): r is typeof r & { list_id: string; word_id: string } =>
        !!r.list_id && !!r.word_id,
      );
    if (refsData.length > 0) {
      await insertInChunks('word_refs', refsData);
    }
  }
}

/**
 * Full sync: pull from Supabase first (merge into local), then push local back up.
 * Always pulls regardless of whether local DB is empty.
 * Used on login, session restore, "Sync now", and background sync.
 */
export async function syncWithSupabase(
  userId: string,
  onProgress?: ProgressFn,
): Promise<void> {
  await mergeFromSupabase(userId, onProgress);
  await pushToSupabase(userId, onProgress);
}
