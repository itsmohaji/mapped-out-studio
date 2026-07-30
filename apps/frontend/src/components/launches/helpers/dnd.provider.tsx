'use client';

import { FC, ReactNode } from 'react';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DndProvider } from 'react-dnd';

/**
 * `context={window}` is deliberate and load-bearing.
 *
 * The HTML5 backend registers global drag handlers and throws
 * "Cannot have two HTML5 backends at the same time!" if a second one is set up
 * before the first tears down. On a client-side navigation React can mount the
 * incoming tree before the outgoing one unmounts, so navigating to the calendar
 * from another page threw and rendered a WHITE PAGE — while a fresh page load,
 * where nothing else is mounted, worked fine.
 *
 * Passing a context makes react-dnd reuse one manager instance keyed on that
 * context instead of constructing a second backend.
 */
export const DNDProvider: FC<{
  children: ReactNode;
}> = ({ children }) => {
  return (
    <DndProvider
      backend={HTML5Backend}
      context={typeof window === 'undefined' ? undefined : window}
    >
      {children}
    </DndProvider>
  );
};
