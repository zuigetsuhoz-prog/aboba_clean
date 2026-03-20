import { useState, useEffect } from 'react';
import type { AppSettings } from '../types';

const SETTINGS_KEY = 'chinese_app_settings';

const defaultSettings: AppSettings = {
  darkMode: false,
  language: 'en',
  ai: {
    enabled: false,
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o-mini',
    endpoint: '',
  },
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) return defaultSettings;
      const parsed = JSON.parse(stored) as Partial<AppSettings>;
      return {
        ...defaultSettings,
        ...parsed,
        ai: { ...defaultSettings.ai, ...(parsed.ai ?? {}) },
      };
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    // Apply dark mode class to <html> so Tailwind `dark:` variant activates
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  return { settings, updateSettings };
}
