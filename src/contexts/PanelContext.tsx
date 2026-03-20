import { createContext, useContext, type ReactNode } from 'react';

/**
 * Allows any screen/component to inject content into the xl+ right panel.
 * Screens call `setPanel(node)` on mount and `setPanel(null)` on unmount.
 */
export const PanelCtx = createContext<(node: ReactNode) => void>(() => {});

export const usePanelContent = () => useContext(PanelCtx);
