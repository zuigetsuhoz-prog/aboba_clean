declare global {
  interface Window {
    responsiveVoice: {
      speak: (text: string, voice: string, parameters?: object) => void;
      cancel: () => void;
    };
  }
}

export {};
