import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { Lang } from '../types';

interface Props {
  onClose: () => void;
  lang: Lang;
}

export function AuthScreen({ onClose, lang }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const ru = lang === 'ru';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        onClose();
      } else {
        await signUp(email, password);
        setSignupDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {mode === 'login'
              ? (ru ? 'Войти' : 'Sign In')
              : (ru ? 'Регистрация' : 'Sign Up')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {signupDone ? (
          <div className="text-center py-4">
            <p className="text-green-600 dark:text-green-400 font-medium mb-2">
              {ru ? '✓ Письмо отправлено!' : '✓ Check your email!'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {ru ? 'Подтвердите email, затем войдите.' : 'Confirm your email, then sign in.'}
            </p>
            <button
              onClick={() => { setSignupDone(false); setMode('login'); }}
              className="text-indigo-600 dark:text-indigo-400 text-sm font-medium"
            >
              {ru ? 'Войти' : 'Sign in'}
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {ru ? 'Пароль' : 'Password'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                             bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 disabled:opacity-50 text-white rounded-xl
                           text-sm font-medium active:scale-95 transition-transform"
              >
                {loading
                  ? '...'
                  : mode === 'login'
                    ? (ru ? 'Войти' : 'Sign In')
                    : (ru ? 'Создать аккаунт' : 'Create Account')}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
                className="text-sm text-indigo-600 dark:text-indigo-400"
              >
                {mode === 'login'
                  ? (ru ? 'Нет аккаунта? Зарегистрироваться' : "Don't have an account? Sign up")
                  : (ru ? 'Уже есть аккаунт? Войти' : 'Already have an account? Sign in')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
