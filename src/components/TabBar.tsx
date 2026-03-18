import type { Tab, Lang } from '../types';
import { useT } from '../i18n';

interface Props {
  active: Tab;
  onSelect: (tab: Tab) => void;
  lang: Lang;
}

export function TabBar({ active, onSelect, lang }: Props) {
  const t = useT(lang);
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'lists',    label: t.tabLists,    icon: '📚' },
    { id: 'study',    label: t.tabStudy,    icon: '🎴' },
    { id: 'search',   label: t.tabSearch,   icon: '🔍' },
    { id: 'settings', label: t.tabSettings, icon: '⚙️' },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50
                    bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5
                      text-xs font-medium transition-colors
                      ${active === tab.id
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-gray-500 dark:text-gray-400'}`}
        >
          <span className="text-xl leading-none">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
