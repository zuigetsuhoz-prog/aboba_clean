/**
 * googleTTS.ts
 * Plays Chinese text via Google Translate TTS.
 * Uses the HTML Audio API directly — no CORS issues since browsers allow
 * cross-origin media src without preflight.
 */

export async function playGoogleTTS(text: string): Promise<'ok' | 'none'> {
  const url =
    `https://translate.google.com/translate_tts` +
    `?ie=UTF-8&q=${encodeURIComponent(text)}&tl=zh-CN&client=tw-ob`;

  return new Promise(resolve => {
    const audio = new Audio(url);

    const onEnded = () => { cleanup(); resolve('ok'); };
    const onError = () => { cleanup(); resolve('none'); };

    function cleanup() {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    }

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.play().catch(() => { cleanup(); resolve('none'); });
  });
}
