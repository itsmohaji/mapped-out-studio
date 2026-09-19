/**
 * @jest-environment ./jest.jsdom.env.cjs
 */
/**
 * Regression tests for the detached-DOM growth found with heap snapshots on
 * 2026-09-19: every composer open left the closed composer's DOM (~300 nodes)
 * retained by an undestroyed Sortable, plus one undestroyed Uppy uploader.
 */
import React from 'react';
import { render } from '@testing-library/react';

import { SortableList, destroySortable } from '@gitroom/frontend/components/media/sortable.list';
import { disposeUppy } from '@gitroom/frontend/components/media/uppy.dispose';

const sortableKey = (el: Element) => Object.keys(el).find((k) => k.startsWith('Sortable'));

describe('SortableList', () => {
  it('destroys its Sortable when it unmounts (react-sortablejs never does)', () => {
    const list = [{ id: 1 }, { id: 2 }];
    const { container, unmount } = render(
      <SortableList list={list} setList={() => undefined} className="sortable-container">
        {list.map((i) => <div key={i.id}>{i.id}</div>)}
      </SortableList>
    );
    const el = container.querySelector('.sortable-container')!;
    const key = sortableKey(el)!;
    expect(key).toBeTruthy();
    expect((el as any)[key]).toBeTruthy(); // live instance while mounted

    unmount();
    // Sortable.destroy() nulls the expando and removes the element from its
    // module-level registry — which is what was keeping the DOM alive.
    expect((el as any)[key]).toBeNull();
  });

  it('keeps the layout: the wrapper does not add a box', () => {
    const { container } = render(
      <SortableList list={[{ id: 1 }]} setList={() => undefined}>
        <div>1</div>
      </SortableList>
    );
    expect((container.firstElementChild as HTMLElement).style.display).toBe('contents');
  });

  it('destroySortable is a no-op on elements without a Sortable', () => {
    expect(() => destroySortable(document.createElement('div'))).not.toThrow();
    expect(() => destroySortable(null)).not.toThrow();
  });
});

describe('disposeUppy', () => {
  const fake = (files: any[]) => {
    const handlers: Record<string, () => void> = {};
    return { getFiles: () => files, once: jest.fn((e: string, cb: () => void) => (handlers[e] = cb)), destroy: jest.fn(), handlers };
  };

  it('destroys an idle uploader immediately', () => {
    const u = fake([{ progress: { uploadStarted: null, uploadComplete: false } }]);
    disposeUppy(u);
    expect(u.destroy).toHaveBeenCalledTimes(1);
  });

  it('never cancels an upload in progress: destroys only when it completes', () => {
    const u = fake([{ progress: { uploadStarted: 123, uploadComplete: false } }]);
    disposeUppy(u);
    expect(u.destroy).not.toHaveBeenCalled();
    u.handlers.complete();
    expect(u.destroy).toHaveBeenCalledTimes(1);
  });
});
