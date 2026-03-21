/**
 * pinyinAudio.ts
 * Plays pinyin syllables from local MP3 files in /audio/pinyin/.
 * Fully offline — no Web Speech API, no network dependency after first cache.
 */

const BASE_URL = '/audio/pinyin/';

// ── In-memory audio cache ────────────────────────────────────────────────────
const cache = new Map<string, HTMLAudioElement>();

function getAudio(filename: string): HTMLAudioElement {
  if (!cache.has(filename)) {
    const audio = new Audio(`${BASE_URL}${filename}`);
    audio.preload = 'auto';
    cache.set(filename, audio);
  }
  return cache.get(filename)!;
}

// ── Tone mark → (base letter + tone number) ─────────────────────────────────
// Maps each diacritical vowel to [stripped vowel, tone number]
const TONE_MAP: Record<string, [string, number]> = {
  'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
  'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
  'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
  'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
  'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
  // ü with tones
  'ǖ': ['u', 1], 'ǘ': ['u', 2], 'ǚ': ['u', 3], 'ǜ': ['u', 4],
  // ü without tone → treat as base 'u' (yu/lü/nü → yu/lu/nu in this dataset)
  'ü': ['u', 0],
};

/**
 * Convert one pinyin syllable with tone marks to a filename base + tone number.
 * e.g. "nǐ" → { base: "ni", tone: 3 }
 *      "hǎo" → { base: "hao", tone: 3 }
 *      "ma" → { base: "ma", tone: 5 }  (neutral)
 */
function parseSyllable(syllable: string): { base: string; tone: number } {
  let base = '';
  let tone = 0; // 0 = no diacritic found yet

  for (const ch of syllable) {
    if (TONE_MAP[ch]) {
      const [letter, t] = TONE_MAP[ch];
      base += letter;
      if (t > 0) tone = t;
    } else {
      base += ch;
    }
  }

  // Neutral tone = 5 when no tone mark was present
  if (tone === 0) tone = 5;
  return { base, tone };
}

/**
 * Convert a full pinyin string (possibly multi-syllable, space-separated)
 * into an ordered list of MP3 filenames to try.
 * Falls back: try tone5 files only if they exist (most syllables are 1-4 only).
 */
function pinyinToFilenames(pinyin: string): string[][] {
  // Split on spaces, filter empty
  const syllables = pinyin
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return syllables.map(syl => {
    const { base, tone } = parseSyllable(syl);
    const candidates: string[] = [];

    if (tone >= 1 && tone <= 5) {
      candidates.push(`${base}${tone}.mp3`);
    }
    // Also try without tone suffix for edge cases
    if (tone === 5) {
      // Some neutral-tone syllables only exist as tone 5 in this dataset
      // Try tones 1-4 as last-resort fallback
      for (let t = 1; t <= 4; t++) candidates.push(`${base}${t}.mp3`);
    }

    return candidates;
  });
}

// ── Probe whether an audio file exists (HEAD request, cached) ────────────────
const existsCache = new Map<string, boolean>();

async function fileExists(filename: string): Promise<boolean> {
  if (existsCache.has(filename)) return existsCache.get(filename)!;
  try {
    const r = await fetch(`${BASE_URL}${filename}`, { method: 'HEAD' });
    const ok = r.ok;
    existsCache.set(filename, ok);
    return ok;
  } catch {
    existsCache.set(filename, false);
    return false;
  }
}

// ── Play a single audio element, resolve when done ───────────────────────────
function playAudio(audio: HTMLAudioElement): Promise<boolean> {
  return new Promise(resolve => {
    // Reset to start in case previously played
    audio.currentTime = 0;
    const onEnded = () => { cleanup(); resolve(true); };
    const onError = () => { cleanup(); resolve(false); };
    function cleanup() {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    }
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.play().catch(() => { cleanup(); resolve(false); });
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export type PlayResult = 'ok' | 'partial' | 'none';

/**
 * Play all syllables in the given pinyin string sequentially.
 * Returns 'ok' if all syllables played, 'partial' if some did, 'none' if none did.
 */
export async function playPinyin(pinyin: string): Promise<PlayResult> {
  const syllableOptions = pinyinToFilenames(pinyin);
  if (syllableOptions.length === 0) return 'none';

  let played = 0;

  for (let i = 0; i < syllableOptions.length; i++) {
    const candidates = syllableOptions[i];
    let succeeded = false;

    for (const filename of candidates) {
      const exists = await fileExists(filename);
      if (!exists) continue;
      const audio = getAudio(filename);
      const ok = await playAudio(audio);
      if (ok) { succeeded = true; break; }
    }

    if (succeeded) {
      played++;
      // Small gap between syllables (skip after the last one)
      if (i < syllableOptions.length - 1) {
        await new Promise(r => setTimeout(r, 80));
      }
    }
  }

  if (played === 0) return 'none';
  if (played < syllableOptions.length) return 'partial';
  return 'ok';
}

/**
 * Returns true if at least the first syllable's primary file appears to exist.
 * Lightweight check — uses HEAD request with caching.
 */
export async function canPlayPinyin(pinyin: string): Promise<boolean> {
  const syllableOptions = pinyinToFilenames(pinyin);
  if (syllableOptions.length === 0) return false;
  for (const filename of syllableOptions[0]) {
    if (await fileExists(filename)) return true;
  }
  return false;
}

/**
 * Pre-warm the cache for a list of pinyin strings.
 * Call this when a word list is opened so audio plays instantly.
 */
export function prewarmCache(pinyinList: string[]): void {
  for (const pinyin of pinyinList) {
    const syllableOptions = pinyinToFilenames(pinyin);
    for (const candidates of syllableOptions) {
      // Only prewarm the primary candidate per syllable
      const filename = candidates[0];
      if (filename && !cache.has(filename)) {
        getAudio(filename); // creates + preloads the Audio element
      }
    }
  }
}
