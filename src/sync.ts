import { supabase } from './supabase';
import { db } from './db';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

/**
 * Fetch all user data from Supabase and UPSERT into local IndexedDB.
 * Existing local records (matched by syncId) are updated; new ones are inserted.
 * Local-only records (no syncId match on server) are left untouched.
 */
export async function mergeFromSupabase(userId: string): Promise<void> {
  const [{ data: sbLists, error: e1 }, { data: sbWords, error: e2 }, { data: sbRefs, error: e3 }] =
    await Promise.all([
      supabase.from('word_lists').select('*').eq('user_id', userId),
      supabase.from('words').select('*').eq('user_id', userId),
      supabase.from('word_refs').select('*').eq('user_id', userId),
    ]);

  if (e1 || e2 || e3) throw new Error(e1?.message ?? e2?.message ?? e3?.message ?? 'Fetch failed');
  if (!sbLists || !sbWords || !sbRefs) throw new Error('No data returned');

  await db.transaction('rw', [db.wordLists, db.words, db.wordRefs], async () => {
    // ── Upsert word lists ──────────────────────────────────────────────────
    const listIdMap = new Map<string, number>(); // server uuid → local id
    for (const l of sbLists) {
      const existing = await db.wordLists.where('syncId').equals(l.id).first();
      if (existing) {
        await db.wordLists.update(existing.id!, {
          name: l.name,
          description: l.description ?? undefined,
          createdAt: new Date(l.created_at).getTime(),
        });
        listIdMap.set(l.id, existing.id!);
      } else {
        const localId = (await db.wordLists.add({
          name: l.name,
          description: l.description ?? undefined,
          createdAt: new Date(l.created_at).getTime(),
          syncId: l.id,
        })) as number;
        listIdMap.set(l.id, localId);
      }
    }

    // ── Upsert words ───────────────────────────────────────────────────────
    const wordIdMap = new Map<string, number>(); // server uuid → local id
    for (const w of sbWords) {
      const existing = await db.words.where('syncId').equals(w.id).first();
      if (existing) {
        await db.words.update(existing.id!, {
          hanzi: w.hanzi,
          pinyin: w.pinyin,
          translation: w.translation,
          confidence: w.confidence,
          reviewCount: w.review_count,
          notes: w.notes ?? undefined,
          lastReviewed: w.last_reviewed ?? undefined,
        });
        wordIdMap.set(w.id, existing.id!);
      } else {
        const localId = (await db.words.add({
          hanzi: w.hanzi,
          pinyin: w.pinyin,
          translation: w.translation,
          confidence: w.confidence,
          reviewCount: w.review_count,
          notes: w.notes ?? undefined,
          lastReviewed: w.last_reviewed ?? undefined,
          syncId: w.id,
        })) as number;
        wordIdMap.set(w.id, localId);
      }
    }

    // ── Upsert word refs ───────────────────────────────────────────────────
    for (const r of sbRefs) {
      const existing = r.id ? await db.wordRefs.where('syncId').equals(r.id).first() : undefined;
      if (!existing) {
        const localListId = listIdMap.get(r.list_id);
        const localWordId = wordIdMap.get(r.word_id);
        if (localListId !== undefined && localWordId !== undefined) {
          const byIds = await db.wordRefs.where({ listId: localListId, wordId: localWordId }).first();
          if (!byIds) {
            await db.wordRefs.add({ listId: localListId, wordId: localWordId, syncId: r.id });
          } else if (!byIds.syncId) {
            await db.wordRefs.update(byIds.id!, { syncId: r.id });
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
export async function overwriteLocalWithSupabase(userId: string): Promise<void> {
  const [{ data: sbLists, error: e1 }, { data: sbWords, error: e2 }, { data: sbRefs, error: e3 }] =
    await Promise.all([
      supabase.from('word_lists').select('*').eq('user_id', userId),
      supabase.from('words').select('*').eq('user_id', userId),
      supabase.from('word_refs').select('*').eq('user_id', userId),
    ]);

  if (e1 || e2 || e3) throw new Error(e1?.message ?? e2?.message ?? e3?.message ?? 'Fetch failed');
  if (!sbLists || !sbWords || !sbRefs) throw new Error('No data returned');

  await db.transaction('rw', [db.wordLists, db.words, db.wordRefs], async () => {
    await db.wordRefs.clear();
    await db.words.clear();
    await db.wordLists.clear();

    const listIdMap = new Map<string, number>();
    for (const l of sbLists) {
      const localId = (await db.wordLists.add({
        name: l.name,
        description: l.description ?? undefined,
        createdAt: new Date(l.created_at).getTime(),
        syncId: l.id,
      })) as number;
      listIdMap.set(l.id, localId);
    }

    const wordIdMap = new Map<string, number>();
    for (const w of sbWords) {
      const localId = (await db.words.add({
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        translation: w.translation,
        confidence: w.confidence,
        reviewCount: w.review_count,
        notes: w.notes ?? undefined,
        lastReviewed: w.last_reviewed ?? undefined,
        syncId: w.id,
      })) as number;
      wordIdMap.set(w.id, localId);
    }

    for (const r of sbRefs) {
      const localListId = listIdMap.get(r.list_id);
      const localWordId = wordIdMap.get(r.word_id);
      if (localListId !== undefined && localWordId !== undefined) {
        await db.wordRefs.add({ listId: localListId, wordId: localWordId, syncId: r.id });
      }
    }
  });
}

/**
 * Push all local data to Supabase (replace-all strategy):
 * deletes all user records in Supabase then re-inserts everything.
 * Assigns UUIDs (syncId) to local records that don't have one yet.
 */
export async function pushToSupabase(userId: string): Promise<void> {
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
    const { error } = await supabase.from('word_lists').insert(
      lists.map(l => ({
        id: l.syncId,
        user_id: userId,
        name: l.name,
        description: l.description ?? null,
        created_at: new Date(l.createdAt).toISOString(),
      })),
    );
    if (error) throw error;
  }

  if (words.length > 0) {
    const { error } = await supabase.from('words').insert(
      words.map(w => ({
        id: w.syncId,
        user_id: userId,
        list_id: null,
        hanzi: w.hanzi,
        pinyin: w.pinyin,
        translation: w.translation,
        confidence: w.confidence,
        review_count: w.reviewCount,
        notes: w.notes ?? null,
        last_reviewed: w.lastReviewed ?? null,
      })),
    );
    if (error) throw error;
  }

  if (refs.length > 0) {
    const refsData = refs
      .map(r => ({
        id: r.syncId,
        user_id: userId,
        list_id: listMap.get(r.listId),
        word_id: wordMap.get(r.wordId),
      }))
      .filter((r): r is typeof r & { list_id: string; word_id: string } =>
        !!r.list_id && !!r.word_id,
      );
    if (refsData.length > 0) {
      const { error } = await supabase.from('word_refs').insert(refsData);
      if (error) throw error;
    }
  }
}

/**
 * Full sync: pull from Supabase first (merge into local), then push local back up.
 * Always pulls regardless of whether local DB is empty.
 * Used on login, session restore, "Sync now", and background sync.
 */
export async function syncWithSupabase(userId: string): Promise<void> {
  await mergeFromSupabase(userId);
  await pushToSupabase(userId);
}
