'use client';

import EventEmitter from 'events';
import dynamic from 'next/dynamic';
import { FC, useCallback, useEffect, useState } from 'react';

/**
 * The global "pick media" modal listener, without the media library itself.
 *
 * The site layout mounts this on every page. It used to live in
 * media.component.tsx, so every page downloaded the whole media library with
 * it — the Uppy uploader, the AI image/video tools, third-party media pickers
 * (performance baseline, 2026-09-19). The listener is tiny; the MediaBox loads
 * only when something actually opens it.
 */
const showModalEmitter = new EventEmitter();

const MediaBox = dynamic(
  () => import('@gitroom/frontend/components/media/media.component').then((m) => m.MediaBox),
  { ssr: false }
);

export const ShowMediaBoxModal: FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [callBack, setCallBack] =
    useState<(params: { id: string; path: string }[]) => void | undefined>();
  const closeModal = useCallback(() => {
    setShowModal(false);
    setCallBack(undefined);
  }, []);
  useEffect(() => {
    showModalEmitter.on('show-modal', (cCallback) => {
      setShowModal(true);
      setCallBack(() => cCallback);
    });
    return () => {
      showModalEmitter.removeAllListeners('show-modal');
    };
  }, []);
  if (!showModal) return null;
  return (
    <div className="text-textColor">
      <MediaBox setMedia={callBack!} closeModal={closeModal} />
    </div>
  );
};

export const showMediaBox = (
  callback: (params: { id: string; path: string }) => void
) => {
  showModalEmitter.emit('show-modal', callback);
};
