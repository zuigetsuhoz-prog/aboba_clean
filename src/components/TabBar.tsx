import type { Tab } from '../types';

interface Props {
  active: Tab;
  onSelect: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'lists', label: 'Lists', icon: '📚' },
  { id: 'study', label: 'Study', icon: '🎴' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function TabBar({ active, onSelect }: Props) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50
                    bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700
                    flex safe-bottom">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium
            transition-colors
            ${active === t.id
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-gray-500 dark:text-gray-400'}`}
        >
          <span className="text-xl leading-none">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
