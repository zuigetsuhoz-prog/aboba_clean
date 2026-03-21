/**
 * pinyinAudio.ts
 * Plays pinyin syllables from local MP3 files in /audio/pinyin/.
 * Fully offline — no Web Speech API, no HEAD probing, no network dependencies.
 *
 * Strategy: just try to play each candidate Audio element directly.
 * The browser's own error event handles missing files (404 → MediaError).
 * This avoids the HEAD-request problem where Vite / service workers may
 * return 405 or mis-cache the result, making all files appear absent.
 */

const BASE_URL = '/audio/pinyin/';

// ── In-memory cache: filename → Audio element ────────────────────────────────
const cache = new Map<string, HTMLAudioElement>();

function getAudio(filename: string): HTMLAudioElement {
  if (!cache.has(filename)) {
    // preload='none' → browser doesn't load until play() is called,
    // so we don't burn bandwidth on files that may never be played.
    const audio = new Audio(`${BASE_URL}${filename}`);
    audio.preload = 'none';
    cache.set(filename, audio);
  }
  return cache.get(filename)!;
}

// ── Tone-mark → (stripped vowel, tone number) table ─────────────────────────
const TONE_MAP: Record<string, [string, number]> = {
  'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
  'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
  'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
  'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
  'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
  'ǖ': ['u', 1], 'ǘ': ['u', 2], 'ǚ': ['u', 3], 'ǜ': ['u', 4],
  'ü': ['u', 0],
};

/**
 * "nǐ" → { base: "ni", tone: 3 }
 * "hǎo" → { base: "hao", tone: 3 }
 * "ma"  → { base: "ma",  tone: 5 }  (no mark = neutral)
 */
function parseSyllable(syllable: string): { base: string; tone: number } {
  // Normalise to NFC so precomposed tone letters always match the table keys
  const s = syllable.normalize('NFC');
  let base = '';
  let tone = 0;

  for (const ch of s) {
    const mapped = TONE_MAP[ch];
    if (mapped) {
      const [letter, t] = mapped;
      base += letter;
      if (t > 0) tone = t;
    } else {
      base += ch;
    }
  }

  if (tone === 0) tone = 5; // no diacritic → neutral tone
  return { base, tone };
}

/**
 * Returns an ordered list of candidate filenames for each syllable.
 * First candidate is the exact tone; neutral-tone syllables also fall back
 * to tones 1-4 in case the dataset only has those.
 */
function pinyinToFilenames(pinyin: string): string[][] {
  return pinyin
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(syl => {
      const { base, tone } = parseSyllable(syl);
      const candidates: string[] = [];
      if (tone >= 1 && tone <= 5) candidates.push(`${base}${tone}.mp3`);
      if (tone === 5) {
        // Neutral-tone fallback: some syllables only have numbered tones
        for (let t = 1; t <= 4; t++) candidates.push(`${base}${t}.mp3`);
      }
      return candidates;
    });
}

// ── Play one Audio element; resolve true on success, false on any error ───────
function playAudio(audio: HTMLAudioElement): Promise<boolean> {
  return new Promise(resolve => {
    // If a previous load attempt already hard-errored, bail immediately
    if (audio.error) { resolve(false); return; }

    const onEnded = () => { cleanup(); resolve(true); };
    const onError = () => { cleanup(); resolve(false); };

    function cleanup() {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    }

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    // Reset position so re-plays work correctly
    audio.currentTime = 0;
    audio.play().catch(() => { cleanup(); resolve(false); });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export type PlayResult = 'ok' | 'partial' | 'none';

/**
 * Play all syllables in the pinyin string sequentially.
 * Returns 'ok' | 'partial' | 'none' depending on how many syllables played.
 * Missing files are silently skipped (browser MediaError → resolve(false)).
 */
export async function playPinyin(pinyin: string): Promise<PlayResult> {
  const syllableOptions = pinyinToFilenames(pinyin);
  if (syllableOptions.length === 0) return 'none';

  let played = 0;

  for (let i = 0; i < syllableOptions.length; i++) {
    let succeeded = false;

    for (const filename of syllableOptions[i]) {
      const audio = getAudio(filename);
      const ok = await playAudio(audio);
      if (ok) { succeeded = true; break; }
      // If playback failed, evict from cache so the next attempt re-creates
      // the Audio element (avoids a stuck MediaError state)
      cache.delete(filename);
    }

    if (succeeded) {
      played++;
      if (i < syllableOptions.length - 1) {
        await new Promise<void>(r => setTimeout(r, 80));
      }
    }
  }

  if (played === 0) return 'none';
  if (played < syllableOptions.length) return 'partial';
  return 'ok';
}

/**
 * Pre-warm the audio cache for a list of pinyin strings.
 * Creates Audio elements with preload='auto' so they buffer in the background.
 */
export function prewarmCache(pinyinList: string[]): void {
  for (const pinyin of pinyinList) {
    for (const candidates of pinyinToFilenames(pinyin)) {
      const filename = candidates[0];
      if (!filename) continue;
      if (!cache.has(filename)) {
        const audio = new Audio(`${BASE_URL}${filename}`);
        audio.preload = 'auto';
        cache.set(filename, audio);
      }
    }
  }
}
