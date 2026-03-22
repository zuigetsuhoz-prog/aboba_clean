/**
 * tts.ts
 * Plays Chinese text via ResponsiveVoice, with Web Speech API fallback.
 */

export function playTTS(hanzi: string): void {
  if (window.responsiveVoice) {
    window.responsiveVoice.speak(hanzi, "Chinese Female");
  } else {
    // fallback to Web Speech API
    const utter = new SpeechSynthesisUtterance(hanzi);
    utter.lang = 'zh-CN';
    window.speechSynthesis.speak(utter);
  }
}
