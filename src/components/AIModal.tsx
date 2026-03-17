import { useState } from 'react';
import { Modal } from './Modal';
import type { AISettings } from '../types';

interface Props {
  hanzi: string;
  settings: AISettings;
  onClose: () => void;
  onOpenSettings: () => void;
}

interface AIResult {
  sentence: string;
  pinyin: string;
  translation: string;
}

export function AIModal({ hanzi, settings, onClose, onOpenSettings }: Props) {
  const [result, setResult] = useState<AIResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!settings.apiKey) return;
    setLoading(true);
    setError('');
    try {
      const prompt = `Generate 1 short example sentence in Chinese using '${hanzi}'. Return only JSON: { "sentence": "...", "pinyin": "...", "translation": "..." }`;

      let url = '';
      let headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let body: unknown;

      if (settings.provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages';
        headers = {
          ...headers,
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-calls': 'true',
        };
        body = {
          model: settings.model || 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [{ role: 'user', content: prompt }],
        };
      } else {
        // OpenAI or custom
        url = settings.provider === 'custom' && settings.endpoint
          ? settings.endpoint
          : 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${settings.apiKey}`;
        body = {
          model: settings.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 256,
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();

      let text = '';
      if (settings.provider === 'anthropic') {
        text = data.content?.[0]?.text ?? '';
      } else {
        text = data.choices?.[0]?.message?.content ?? '';
      }

      // Extract JSON from response
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Invalid response format');
      const parsed = JSON.parse(match[0]);
      setResult(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    if (!result) return;
    navigator.clipboard.writeText(
      `${result.sentence}\n${result.pinyin}\n${result.translation}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal title={`AI Example: ${hanzi}`} onClose={onClose}>
      {!settings.apiKey ? (
        <div className="text-center py-6">
          <p className="text-4xl mb-3">🔑</p>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Configure your API key in Settings to use AI features.
          </p>
          <button
            onClick={() => { onClose(); onOpenSettings(); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium"
          >
            Open Settings
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {!result && !loading && (
            <button
              onClick={generate}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold
                         active:scale-95 transition-transform"
            >
              ✨ Generate Example
            </button>
          )}

          {loading && (
            <div className="text-center py-8">
              <div className="inline-block w-8 h-8 border-4 border-indigo-600
                              border-t-transparent rounded-full animate-spin" />
              <p className="mt-3 text-gray-500 dark:text-gray-400">Generating...</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400
                            rounded-lg text-sm">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl space-y-1">
                <p className="text-2xl font-medium text-gray-900 dark:text-white">
                  {result.sentence}
                </p>
                <p className="text-indigo-600 dark:text-indigo-400">{result.pinyin}</p>
                <p className="text-gray-600 dark:text-gray-300">{result.translation}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyAll}
                  className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             text-sm font-medium text-gray-700 dark:text-gray-300
                             active:bg-gray-50 dark:active:bg-gray-700 transition-colors"
                >
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
                <button
                  onClick={generate}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm
                             font-medium active:scale-95 transition-transform"
                >
                  ✨ Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
