const isBrowser = typeof window !== 'undefined';
const supported = isBrowser && 'speechSynthesis' in window;

function getChineseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(v => v.lang === 'zh-CN') ??
    voices.find(v => v.lang === 'zh-TW') ??
    voices.find(v => v.lang.startsWith('zh')) ??
    null
  );
}

function doSpeak(text: string, lang: string): void {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  if (lang.startsWith('zh')) {
    const voice = getChineseVoice();
    if (voice) utterance.voice = voice;
  }
  utterance.onerror = (e) => {
    // 'interrupted' fires whenever cancel() is called — not a real error
    if (e.error !== 'interrupted') console.warn('TTS error:', e.error);
  };
  window.speechSynthesis.speak(utterance);
}

function speak(text: string, lang = 'zh-CN'): boolean {
  if (!supported) return false;

  // Cancel any in-progress speech
  window.speechSynthesis.cancel();

  const voices = window.speechSynthesis.getVoices();

  if (voices.length === 0) {
    // Chrome bug: voices list is empty on first call — wait for voiceschanged
    window.speechSynthesis.addEventListener(
      'voiceschanged',
      () => window.setTimeout(() => doSpeak(text, lang), 100),
      { once: true },
    );
  } else {
    // Always add a 100ms delay after cancel() to avoid Chrome swallowing the utterance
    window.setTimeout(() => doSpeak(text, lang), 100);
  }

  return true;
}

export function useTTS() {
  return { speak, supported };
}
