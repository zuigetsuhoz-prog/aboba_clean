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
  orderBy: string = 'id',
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Fetch error at offset ${from} (${table}):`, JSON.stringify(error));
      throw new Error(error.message);
    }
    console.log(`Fetched ${data?.length ?? 0} rows from ${table} at offset ${from}`);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    onProgress?.(all.length);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Total fetched from ${table}:`, all.length);
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
    fetchAllPages<Record<string, unknown>>('words', userId, n => onProgress?.(n, 0), 'sort_order'),
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
          sortOrder: (w.sort_order as number | null) ?? undefined,
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
          sortOrder: (w.sort_order as number | null) ?? undefined,
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
    fetchAllPages<Record<string, unknown>>('words', userId, n => onProgress?.(n, 0), 'sort_order'),
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
        sortOrder: (w.sort_order as number | null) ?? undefined,
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

  // Delete all existing user data in Supabase (words first, then lists, then refs)
  console.log('Starting delete for user:', userId);

  const { error: delWords } = await supabase.from('words').delete().eq('user_id', userId);
  if (delWords) {
    console.error('Delete words failed:', delWords);
    throw new Error('Delete words failed: ' + delWords.message);
  }

  const { error: delLists } = await supabase.from('word_lists').delete().eq('user_id', userId);
  if (delLists) {
    console.error('Delete lists failed:', delLists);
    throw new Error('Delete lists failed: ' + delLists.message);
  }

  const { error: delRefs } = await supabase.from('word_refs').delete().eq('user_id', userId);
  if (delRefs) {
    console.error('Delete refs failed:', delRefs);
    throw new Error('Delete refs failed: ' + delRefs.message);
  }

  console.log('Delete complete, starting insert');

  const uniqueLists = Array.from(new Map(lists.map(l => [l.syncId!, l])).values());
  console.log('Total lists:', lists.length, 'After dedup:', uniqueLists.length);

  const uniqueWords = Array.from(new Map(words.map(w => [w.syncId!, w])).values());
  console.log('Total words:', words.length, 'After dedup:', uniqueWords.length);

  const uniqueRefs = Array.from(new Map(refs.map(r => [r.syncId!, r])).values());
  console.log('Total refs:', refs.length, 'After dedup:', uniqueRefs.length);

  if (uniqueLists.length > 0) {
    await insertInChunks(
      'word_lists',
      uniqueLists.map(l => ({
        id: l.syncId!,
        user_id: userId,
        name: l.name,
        description: l.description ?? null,
        created_at: new Date(l.createdAt).toISOString(),
      })),
    );
  }

  if (uniqueWords.length > 0) {
    await insertInChunks(
      'words',
      uniqueWords.map(w => ({
        id: w.syncId!,
        user_id: userId,
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        translation: w.translation,
        confidence: w.confidence,
        review_count: w.reviewCount,
        notes: w.notes ?? null,
        last_reviewed: w.lastReviewed ? new Date(w.lastReviewed).toISOString() : null,
        sort_order: w.sortOrder ?? 0,
      })),
      onProgress,
    );
  }

  if (uniqueRefs.length > 0) {
    const refsData = uniqueRefs
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

/**
 * Fix sort_order for all words in Supabase.
 * For each list, fetches words in local display order (sortOrder ?? id),
 * reassigns sortOrder = 0,1,2,... locally, then upserts sort_order to Supabase.
 */
export async function fixWordOrderInSupabase(userId: string): Promise<void> {
  const lists = await db.wordLists.toArray();

  for (const list of lists) {
    const refs = await db.wordRefs.where('listId').equals(list.id!).toArray();
    refs.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const words = (await db.words.bulkGet(refs.map(r => r.wordId)))
      .filter((w): w is NonNullable<typeof w> => w !== undefined);
    words.sort((a, b) => (a.sortOrder ?? a.id ?? 0) - (b.sortOrder ?? b.id ?? 0));

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.sortOrder !== i) {
        await db.words.update(word.id!, { sortOrder: i });
        word.sortOrder = i;
      }
      if (word.syncId) {
        await supabase
          .from('words')
          .update({ sort_order: i })
          .eq('id', word.syncId)
          .eq('user_id', userId);
      }
    }
  }
}
