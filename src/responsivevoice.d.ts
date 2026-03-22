declare global {
  interface Window {
    responsiveVoice: {
      speak: (text: string, voice: string, parameters?: object) => void;
      cancel: () => void;
    };
  }

  const __APP_VERSION__: string;
  const __GIT_HASH__: string;
}

export {};
