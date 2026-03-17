import { useState, useEffect } from 'react';
import type { AppSettings } from '../types';

const SETTINGS_KEY = 'chinese_app_settings';

const defaultSettings: AppSettings = {
  darkMode: false,
  ai: {
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
      return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
