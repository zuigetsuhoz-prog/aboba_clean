/**
 * tts.ts
 * Plays Chinese text via ResponsiveVoice, with Web Speech API fallback.
 */

export function cancelTTS(): void {
  if (window.responsiveVoice) {
    window.responsiveVoice.cancel();
  } else {
    window.speechSynthesis.cancel();
  }
}

export function playTTS(text: string): void {
  if (window.responsiveVoice) {
    window.responsiveVoice.speak(text, "Chinese Female");
  } else {
    // fallback to Web Speech API
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    window.speechSynthesis.speak(utter);
  }
}
