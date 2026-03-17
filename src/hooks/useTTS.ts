export function useTTS() {
  const supported = 'speechSynthesis' in window;

  const speak = (text: string, lang = 'zh-CN') => {
    if (!supported) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
    return true;
  };

  return { speak, supported };
}
