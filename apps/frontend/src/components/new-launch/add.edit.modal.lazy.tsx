'use client';

import dynamic from 'next/dynamic';
import type { AddEditModalProps } from '@gitroom/frontend/components/new-launch/add.edit.modal';

/**
 * The post composer, loaded when it is first opened — not with the page.
 *
 * Seven places imported AddEditModal directly, so the Calendar (and every page
 * that could open the composer) downloaded all of it up front: three editors,
 * the emoji picker, the uploader, every platform preview (performance baseline,
 * 2026-09-19: Calendar 2.3–2.5 MB compressed on arrival). Import from here
 * instead. `preloadComposer()` starts the download on intent (hovering "Create
 * Post", pointing at the calendar grid) so the first open is not slower.
 */
const load = () => import('@gitroom/frontend/components/new-launch/add.edit.modal');

let preloading: Promise<unknown> | null = null;
export const preloadComposer = () => (preloading ??= load());

export const AddEditModal = dynamic<AddEditModalProps>(
  () => load().then((m) => m.AddEditModal),
  { ssr: false }
);
